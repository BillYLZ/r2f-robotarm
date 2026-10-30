import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Html, Lightformer, Line, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { AXIS_COLORS, Axes, Chip, DHOverlay, InFrame, Robot, ToolMesh, toMatrix4 } from './Robot.jsx'
import { column, multiply, position } from '@/kinematics/mat4.js'
import { toolMatrix } from '@/kinematics/pivot.js'
import { useSceneTheme } from '@/theme.js'

export const PANEL = 432 // desktop side panel width incl. margin
const DURATION = 0.6

const VIEWS = {
  persp: (d) => new THREE.Vector3(d * 0.75, d * 0.55, d * 0.85),
  front: (d) => new THREE.Vector3(0, d * 0.35, d * 1.1),
  side: (d) => new THREE.Vector3(d * 1.1, d * 0.35, 0),
  top: (d) => new THREE.Vector3(0, d * 1.15, 0.001),
}
const ease = (t) => 1 - Math.pow(1 - t, 3)

/** Orbit camera with preset views; on desktop the robot is centered in the space beside the panel. */
function CameraRig({ view, resetKey, reach, height }) {
  const { camera, size } = useThree()
  const aspect = size.width / size.height
  const controls = useRef()
  const anim = useRef(null)

  useEffect(() => {
    const side = size.width >= 768 ? PANEL : 0
    if (side) camera.setViewOffset(size.width, size.height, -side / 2, 0, size.width, size.height)
    else camera.clearViewOffset()
  }, [camera, size])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const d = Math.max(1, reach * 1.8) / Math.min(1, aspect * 1.1)
    const toTarget = new THREE.Vector3(0, height, 0)
    const toPos = (VIEWS[view] || VIEWS.persp)(d).add(toTarget)
    anim.current = { t: 0, fromPos: camera.position.clone(), fromTarget: c.target.clone(), toPos, toTarget }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, resetKey])

  useFrame((_, dt) => {
    const a = anim.current
    const c = controls.current
    if (!a || !c) return
    a.t = Math.min(a.t + dt / DURATION, 1)
    const k = ease(a.t)
    camera.position.lerpVectors(a.fromPos, a.toPos, k)
    c.target.lerpVectors(a.fromTarget, a.toTarget, k)
    if (a.t === 1) anim.current = null
    c.update()
  })

  return <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 1.9} minDistance={0.3} maxDistance={12} onStart={() => (anim.current = null)} />
}

/**
 * Draggable goal for inverse kinematics. The goal object lives in DH base coordinates (inside the robot group);
 * its gizmo is rendered by <TransformControls> at the scene root, since the gizmo already works in world space.
 */
function Target({ goal, onMove, objRef }) {
  useEffect(() => {
    if (!objRef.current) return
    toMatrix4(goal.m).decompose(objRef.current.position, objRef.current.quaternion, objRef.current.scale)
    // Only re-seed when the goal is reset from outside, not on every drag step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.seed])
  useEffect(() => {
    objRef.current.userData.emit = () => {
      const o = objRef.current
      o.updateMatrix()
      const e = o.matrix.elements // column-major
      onMove([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14], 0, 0, 0, 1])
    }
  }, [objRef, onMove])
  return (
    <group ref={objRef}>
      <mesh>
        <sphereGeometry args={[0.022, 20, 20]} />
        <meshStandardMaterial color="#e8434f" emissive="#e8434f" emissiveIntensity={0.4} transparent opacity={0.85} />
      </mesh>
      <Axes size={0.08} labels={false} />
    </group>
  )
}

/**
 * Dragging a frame along one of its own axes.
 * The mouse ray is intersected with the plane that contains the axis and faces the camera,
 * then projected onto the axis: the frame can only slide along the grabbed arrow.
 */
function useAxisDrag({ baseRef, fk, onFrameDrag, onFrameDragEnd }) {
  const { camera, gl, controls } = useThree()
  const [drag, setDrag] = useState(null)
  const fkRef = useRef(fk)
  fkRef.current = fk

  const grab = useCallback(
    (frame, axis, e) => {
      const base = baseRef.current
      if (!base) return
      const m = fkRef.current.frames[frame]
      const p0 = position(m)
      const dir = column(m, axis)
      base.updateWorldMatrix(true, false)
      const O = base.localToWorld(new THREE.Vector3(...p0))
      const D = new THREE.Vector3(...dir).transformDirection(base.matrixWorld)
      const ray = new THREE.Raycaster()
      const plane = new THREE.Plane()
      const hit = new THREE.Vector3()

      const along = (clientX, clientY) => {
        const rect = gl.domElement.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera)
        // Plane through the axis, turned towards the camera as much as possible.
        const view = camera.getWorldDirection(new THREE.Vector3())
        const n = view.sub(D.clone().multiplyScalar(view.dot(D)))
        if (n.lengthSq() < 1e-8) return null // looking straight down the axis
        plane.setFromNormalAndCoplanarPoint(n.normalize(), O)
        if (!ray.ray.intersectPlane(plane, hit)) return null
        return hit.clone().sub(O).dot(D)
      }

      const t0 = along(e.nativeEvent.clientX, e.nativeEvent.clientY)
      if (t0 == null) return
      if (controls) controls.enabled = false
      document.body.style.cursor = 'grabbing'
      setDrag({ frame, axis, p0, dir, delta: 0 })

      const move = (ev) => {
        const t = along(ev.clientX, ev.clientY)
        if (t == null) return
        const delta = t - t0
        const goal = m.slice()
        goal[3] = p0[0] + dir[0] * delta
        goal[7] = p0[1] + dir[1] * delta
        goal[11] = p0[2] + dir[2] * delta
        const res = onFrameDrag(frame, goal)
        setDrag((d) => d && { ...d, delta, ok: res?.ok ?? true })
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (controls) controls.enabled = true
        document.body.style.cursor = ''
        setDrag(null)
        onFrameDragEnd?.()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [baseRef, camera, gl, controls, onFrameDrag, onFrameDragEnd],
  )
  return { drag, grab }
}

/** Thin guide line along the dragged axis with the travelled distance. */
function DragGuide({ drag, length }) {
  const { p0, dir, axis, delta, ok = true } = drag
  const color = AXIS_COLORS[axis]
  const at = (t) => [p0[0] + dir[0] * t, p0[1] + dir[1] * t, p0[2] + dir[2] * t]
  return (
    <group>
      <Line points={[at(-length), at(length)]} color={color} lineWidth={1} dashed dashSize={0.02} gapSize={0.012} transparent opacity={0.8} depthTest={false} />
      <mesh position={p0} renderOrder={3}>
        <sphereGeometry args={[0.008, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <Html position={at(delta)} center zIndexRange={[30, 20]} className="pointer-events-none select-none">
        <Chip color={ok ? color : '#ff6b6b'} className="relative -top-5 text-[11px] font-semibold">
          {'XYZ'[axis]}
          {drag.frame} {delta >= 0 ? '+' : '−'}
          {Math.abs(delta * 1000).toFixed(1)} mm{ok ? '' : ' · ulaşılamıyor'}
        </Chip>
      </Html>
    </group>
  )
}

/** Fixed point the tool tip must stay on during the TCP rotation program. */
function PivotMarker({ p }) {
  const ring = useMemo(() => {
    const pts = []
    for (let k = 0; k <= 48; k++) {
      const t = (k / 48) * Math.PI * 2
      pts.push([p[0] + 0.03 * Math.cos(t), p[1] + 0.03 * Math.sin(t), p[2]])
    }
    return pts
  }, [p])
  return (
    <group>
      <mesh position={p} renderOrder={3}>
        <sphereGeometry args={[0.006, 16, 16]} />
        <meshBasicMaterial color="#e8434f" depthTest={false} />
      </mesh>
      <Line points={ring} color="#e8434f" lineWidth={1.5} depthTest={false} />
      <Line points={[[p[0], p[1], p[2] - 0.05], [p[0], p[1], p[2] + 0.05]]} color="#e8434f" lineWidth={1} dashed dashSize={0.006} gapSize={0.004} depthTest={false} />
    </group>
  )
}

function Workspace({ points }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return g
  }, [points])
  return (
    <points geometry={geom}>
      <pointsMaterial color="#38bdf8" size={0.012} transparent opacity={0.45} depthWrite={false} />
    </points>
  )
}

/** Studio lighting baked into an environment map (no download): softboxes for clean reflections on paint and metal. */
function Studio({ background }) {
  return (
    <Environment key={background} resolution={256} frames={1}>
      <color attach="background" args={[background]} />
      <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={2} position={[-5, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 1.2, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[5, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 1.2, 1]} color="#bcd6ff" />
      <Lightformer form="ring" intensity={1.5} position={[0, 2, 5]} scale={2} color="#ffd2a8" />
    </Environment>
  )
}

export default function Scene({ fk, q, rows, convention, base, selected, show, view, resetKey, ik, onGoal, trail, cloud, reach, onFrameDrag, onFrameDragEnd, model, tool, pivot }) {
  const scale = Math.min(1.6, Math.max(0.5, reach / 0.8))
  const target = useRef()
  const baseRef = useRef()
  const { drag, grab } = useAxisDrag({ baseRef, fk, onFrameDrag, onFrameDragEnd })
  const t = useSceneTheme()
  return (
    <>
      <color attach="background" args={[t.background]} />
      <fog attach="fog" args={[t.background, 5, 14]} />
      <hemisphereLight args={t.hemi} />
      <directionalLight position={[3, 5, 2.5]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2} shadow-camera-bottom={-2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.7} color="#9cc4ff" />
      <pointLight position={[0, 2.5, -2.5]} intensity={6} color="#ff8a1f" distance={6} />
      <Studio background={t.studio} />
      <ContactShadows position={[0, 0.001, 0]} scale={4} resolution={1024} blur={2.4} opacity={t.contact} far={1.5} frames={Infinity} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial opacity={t.shadow} />
      </mesh>
      <Grid infiniteGrid cellSize={0.05} cellThickness={0.5} sectionSize={0.5} sectionThickness={0.9} cellColor={t.cell} sectionColor={t.section} fadeDistance={10} fadeStrength={2} />
      {/* World axes on the floor: DH x (red) and y (green); three.js z = -DH y */}
      <Line points={[[0, 0.0005, 0], [0.6, 0.0005, 0]]} color={AXIS_COLORS[0]} lineWidth={1} transparent opacity={t.floorAxes} />
      <Line points={[[0, 0.0005, 0], [0, 0.0005, -0.6]]} color={AXIS_COLORS[1]} lineWidth={1} transparent opacity={t.floorAxes} />

      <CameraRig view={view} resetKey={resetKey} reach={reach} height={base + reach * 0.35} />

      {/* DH base frame: z up. three.js is y up, so turn the whole robot by -90° about x. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {base > 0 && (
          <mesh position={[0, 0, base / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.09 * scale, 0.12 * scale, base, 32]} />
            <meshStandardMaterial color="#1d2229" metalness={0.6} roughness={0.45} />
          </mesh>
        )}
        <group position={[0, 0, base]} ref={baseRef}>
          <Robot fk={fk} q={q} rows={rows} selected={selected} showAxes={show.axes} showLabels={show.labels} scale={scale} onAxisGrab={grab} drag={drag} model={model} toolOn={!!tool} jointD={show.jointD} />
          {tool && <ToolMesh m={fk.tool} length={tool.length} diameter={tool.diameter} />}
          {tool && show.axes && (
            <InFrame m={multiply(fk.tool, toolMatrix(tool.length))}>
              <Axes size={0.12 * scale} label="TCP" labels={show.labels} />
            </InFrame>
          )}
          {pivot && <PivotMarker p={pivot} />}
          {drag && <DragGuide drag={drag} length={reach * 1.5} />}
          {show.params && selected != null && <DHOverlay fk={fk} index={selected} convention={convention} scale={scale} />}
          {show.trail && trail.length > 1 && <Line points={trail} color="#38bdf8" lineWidth={2} />}
          {cloud && <Workspace points={cloud} />}
          {ik.on && <Target goal={ik.goal} onMove={onGoal} objRef={target} />}
        </group>
      </group>
      {ik.on && <TransformControls object={target} mode={ik.mode} size={0.7} space="local" onObjectChange={() => target.current?.userData.emit?.()} />}
    </>
  )
}

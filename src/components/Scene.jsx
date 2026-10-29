import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Grid, Line, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { Axes, DHOverlay, Robot, toMatrix4 } from './Robot.jsx'

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

export default function Scene({ fk, rows, convention, base, selected, show, view, resetKey, ik, onGoal, trail, cloud, reach }) {
  const scale = Math.min(1.6, Math.max(0.5, reach / 0.8))
  const target = useRef()
  return (
    <>
      <color attach="background" args={['#0f0f12']} />
      <fog attach="fog" args={['#0f0f12', 6, 16]} />
      <hemisphereLight args={['#dfe7ff', '#202024', 0.9]} />
      <directionalLight position={[3, 5, 2.5]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2} shadow-camera-bottom={-2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial opacity={0.35} />
      </mesh>
      <Grid infiniteGrid cellSize={0.1} sectionSize={1} cellColor="#27272a" sectionColor="#52525b" sectionThickness={1} fadeDistance={12} fadeStrength={1.5} />

      <CameraRig view={view} resetKey={resetKey} reach={reach} height={base + reach * 0.35} />

      {/* DH base frame: z up. three.js is y up, so turn the whole robot by -90° about x. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {base > 0 && (
          <mesh position={[0, 0, base / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.09 * scale, 0.12 * scale, base, 32]} />
            <meshStandardMaterial color="#3f3f46" metalness={0.4} roughness={0.6} />
          </mesh>
        )}
        <group position={[0, 0, base]}>
          <Robot fk={fk} rows={rows} convention={convention} selected={selected} showAxes={show.axes} showLabels={show.labels} scale={scale} />
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

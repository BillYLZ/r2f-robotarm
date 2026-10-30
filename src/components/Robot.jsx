import { lazy, Suspense, useMemo, useState } from 'react'
import { Edges, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { position } from '@/kinematics/mat4.js'

export const AXIS_COLORS = ['#ff4d5e', '#3ddc84', '#4c8dff']
export const PARAM_COLORS = { theta: '#facc15', d: '#22d3ee', a: '#e879f9', alpha: '#a3e635' }

// Modern cobot look: light anodized links, graphite joints, orange accent rings.
const LINK = '#c7ccd4'
const JOINT = '#2b3038'
const ACCENT = '#ff8a1f'
const EDGE = '#0b0e13'
const BASE = '#1d2229'

/** Small mono label chip used in the scene. */
export function Chip({ children, color, className = '' }) {
  return (
    <span
      className={`rounded-[3px] border border-white/10 bg-[#0a0d12]/85 px-1 py-px font-mono text-[10px] leading-none tracking-tight whitespace-nowrap ${className}`}
      style={{ color: color || '#cfe3ff' }}
    >
      {children}
    </span>
  )
}

const ModelRobot = lazy(() => import('./ModelRobot.jsx'))

/** Row-major DH matrix → THREE.Matrix4. */
export const toMatrix4 = (m) => new THREE.Matrix4().set(...m)

/** Children placed in the given DH frame. */
export function InFrame({ m, children }) {
  const matrix = useMemo(() => toMatrix4(m), [m])
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      {children}
    </group>
  )
}

const UP = new THREE.Vector3(0, 1, 0)

/** A cylinder from point `from` to point `to`. */
function Rod({ from, to, radius, color, metalness = 0.6, roughness = 0.32 }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const len = dir.length()
    return {
      len,
      pos: a.add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
    }
  }, [from, to])
  if (len < 1e-4) return null
  return (
    <mesh position={pos} quaternion={quat} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, len, 32]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
      <Edges threshold={30} color={EDGE} />
    </mesh>
  )
}

const AXIS_ROT = [
  [0, 0, -Math.PI / 2], // +y → +x
  [0, 0, 0],
  [Math.PI / 2, 0, 0], // +y → +z
]

/** One thin arrow along +y; with `onGrab` it gets a wide invisible handle and a hover state. */
function Arrow({ size, color, dim, active, onGrab }) {
  const [hover, setHover] = useState(false)
  const hot = hover || active
  const r = size * (hot ? 0.022 : 0.011)
  const opacity = dim && !hot ? 0.3 : 1
  return (
    <group>
      <mesh position={[0, size * 0.42, 0]} renderOrder={2}>
        <cylinderGeometry args={[r, r, size * 0.84, 8]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, size * 0.92, 0]} renderOrder={2}>
        <coneGeometry args={[size * (hot ? 0.055 : 0.04), size * 0.16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} toneMapped={false} />
      </mesh>
      {onGrab && (
        <mesh
          position={[0, size * 0.58, 0]}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(true)
            document.body.style.cursor = 'grab'
          }}
          onPointerOut={() => {
            setHover(false)
            document.body.style.cursor = ''
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onGrab(e)
          }}
        >
          <cylinderGeometry args={[size * 0.09, size * 0.09, size * 0.84, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

/**
 * RGB = XYZ arrows of one frame, with its name.
 * `onGrab(axis, event)` makes every arrow draggable; `activeAxis` highlights the one being dragged.
 */
export function Axes({ size = 0.1, label, dim = false, labels = true, onGrab, activeAxis = null }) {
  return (
    <group>
      <mesh renderOrder={2}>
        <sphereGeometry args={[size * 0.035, 12, 12]} />
        <meshBasicMaterial color="#e6edf7" transparent opacity={dim ? 0.3 : 1} depthTest={false} />
      </mesh>
      {AXIS_ROT.map((rot, i) => (
        <group key={i} rotation={rot}>
          <Arrow size={size} color={AXIS_COLORS[i]} dim={dim} active={activeAxis === i} onGrab={onGrab && ((e) => onGrab(i, e))} />
        </group>
      ))}
      {labels && label != null && (
        <Html position={[-size * 0.18, -size * 0.18, 0]} center zIndexRange={[10, 0]} className="pointer-events-none select-none">
          <Chip>{label}</Chip>
        </Html>
      )}
    </group>
  )
}

/** Joint housing on the joint axis (z of `m`): a drum with accent rings for revolute, a sleeve for prismatic joints. */
function Joint({ m, type, active, scale }) {
  const r = 0.055 * scale
  const h = r * 2.2
  const ring = active ? '#38bdf8' : ACCENT
  return (
    <InFrame m={m}>
      {type === 'R' ? (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[r, r, h, 48]} />
            <meshStandardMaterial color={JOINT} metalness={0.7} roughness={0.38} />
            <Edges threshold={20} color="#4b5563" />
          </mesh>
          {[-1, 1].map((sgn) => (
            <mesh key={sgn} position={[0, (sgn * h) / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[r * 0.82, r * 0.06, 8, 48]} />
              <meshStandardMaterial color={ring} emissive={ring} emissiveIntensity={active ? 1.2 : 0.35} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[r * 1.8, r * 1.8, r * 1.4]} />
          <meshStandardMaterial color={JOINT} metalness={0.7} roughness={0.38} />
          <Edges color={ring} />
        </mesh>
      )}
    </InFrame>
  )
}

/** Arc of `angle` radians in a frame: plane 'xy' starts at x (θ), plane 'yz' starts at z (α). */
function Arc({ m, angle, radius, plane, color, label }) {
  const pts = useMemo(() => {
    const n = Math.max(2, Math.ceil((Math.abs(angle) / Math.PI) * 48))
    const out = []
    for (let k = 0; k <= n; k++) {
      const t = (angle * k) / n
      out.push(plane === 'xy' ? [radius * Math.cos(t), radius * Math.sin(t), 0] : [0, -radius * Math.sin(t), radius * Math.cos(t)])
    }
    return out
  }, [angle, radius, plane])
  const ref = plane === 'xy' ? [[0, 0, 0], [radius * 1.25, 0, 0]] : [[0, 0, 0], [0, 0, radius * 1.25]]
  const end = pts[pts.length - 1]
  return (
    <InFrame m={m}>
      <Line points={ref} color={color} lineWidth={1} dashed dashSize={0.01} gapSize={0.008} depthTest={false} />
      {Math.abs(angle) > 1e-4 && <Line points={pts} color={color} lineWidth={2} depthTest={false} />}
      <Html position={end} center zIndexRange={[20, 10]} className="pointer-events-none select-none">
        <Chip color={color} className="text-[11px] font-semibold">
          {label}
        </Chip>
      </Html>
    </InFrame>
  )
}

/** Measured segment for d or a. */
function Dimension({ from, to, color, label }) {
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={2} depthTest={false} />
      <Html position={mid} center zIndexRange={[20, 10]} className="pointer-events-none select-none">
        <Chip color={color} className="text-[11px] font-semibold">
          {label}
        </Chip>
      </Html>
    </group>
  )
}

const fmtDeg = (rad) => `${((rad * 180) / Math.PI).toFixed(1)}°`
const fmtLen = (m) => `${(m * 1000).toFixed(1)} mm`

/** θ, d, a, α of one row drawn where they act. */
export function DHOverlay({ fk, index, convention, scale }) {
  const link = fk.links[index]
  if (!link) return null
  const n = index + 1
  const prev = fk.frames[index]
  const next = fk.frames[index + 1]
  const r = 0.09 * scale
  // Endpoints of the d and a segments (see `forward`).
  const [dFrom, dTo] =
    convention === 'modified' ? [position(link.thetaFrame), position(next)] : [position(prev), position(link.mid)]
  const [aFrom, aTo] =
    convention === 'modified' ? [position(prev), position(link.thetaFrame)] : [position(link.mid), position(link.alphaFrame)]
  const sub = convention === 'modified' ? n - 1 : n
  return (
    <group>
      <Arc m={link.thetaFrame} angle={link.theta} radius={r} plane="xy" color={PARAM_COLORS.theta} label={`θ${n} ${fmtDeg(link.theta)}`} />
      <Arc m={link.alphaFrame} angle={link.alpha} radius={r * 0.8} plane="yz" color={PARAM_COLORS.alpha} label={`α${sub} ${fmtDeg(link.alpha)}`} />
      {Math.abs(link.d) > 1e-5 && <Dimension from={dFrom} to={dTo} color={PARAM_COLORS.d} label={`d${n} ${fmtLen(link.d)}`} />}
      {Math.abs(link.a) > 1e-5 && <Dimension from={aFrom} to={aTo} color={PARAM_COLORS.a} label={`a${sub} ${fmtLen(link.a)}`} />}
    </group>
  )
}

/**
 * The arm itself, in DH base coordinates (z up).
 * Links follow the DH chain frame → mid → next frame; joints sit on their axes.
 * `onAxisGrab(frame, axis, event)` makes the arrows of frames 1…n draggable (frame 0 is the fixed base).
 */
export function Robot({ fk, rows, selected, showAxes, showLabels, scale = 1, onAxisGrab, drag, model, q }) {
  const schematic = <Schematic fk={fk} rows={rows} selected={selected} scale={scale} />
  return (
    <group>
      {model ? <Suspense fallback={schematic}><ModelRobot q={q} /></Suspense> : schematic}
      {showAxes &&
        fk.frames.map((m, i) => {
          const last = i === fk.frames.length - 1
          const dragging = drag?.frame === i
          const highlight = selected == null || i === selected || i === selected + 1 || last || dragging
          return (
            <InFrame key={i} m={m}>
              <Axes
                size={(last ? 0.14 : 0.1) * scale}
                label={last ? `O${i} · TCP` : `O${i}`}
                dim={!highlight}
                labels={showLabels}
                onGrab={i > 0 && onAxisGrab ? (axis, e) => onAxisGrab(i, axis, e) : undefined}
                activeAxis={dragging ? drag.axis : null}
              />
            </InFrame>
          )
        })}
    </group>
  )
}

/** Links as rods, joints as drums: works for any DH table. */
function Schematic({ fk, rows, selected, scale }) {
  const pts = fk.frames.map(position)
  const mids = fk.links.map((l) => position(l.mid))
  const rodR = 0.03 * scale
  return (
    <group>
      {/* Base plate under frame 0 */}
      <mesh position={[0, 0, 0.025 * scale]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1 * scale, 0.12 * scale, 0.05 * scale, 64]} />
        <meshStandardMaterial color={BASE} metalness={0.6} roughness={0.45} />
        <Edges threshold={20} color="#3b4350" />
      </mesh>
      <mesh position={[0, 0, 0.0505 * scale]}>
        <ringGeometry args={[0.085 * scale, 0.092 * scale, 64]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} />
      </mesh>
      {fk.links.map((l, i) => (
        <group key={i}>
          <Rod from={pts[i]} to={mids[i]} radius={rodR} color={LINK} />
          <Rod from={mids[i]} to={pts[i + 1]} radius={rodR} color={LINK} />
          <Joint m={l.axis} type={rows[i].type} active={i === selected} scale={scale} />
        </group>
      ))}
      {/* Tool flange */}
      <InFrame m={fk.tool}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.008 * scale]} castShadow>
          <cylinderGeometry args={[0.035 * scale, 0.035 * scale, 0.016 * scale, 32]} />
          <meshStandardMaterial color={JOINT} metalness={0.8} roughness={0.25} />
          <Edges color={ACCENT} threshold={20} />
        </mesh>
      </InFrame>
    </group>
  )
}

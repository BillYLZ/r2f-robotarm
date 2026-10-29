import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { position } from '@/kinematics/mat4.js'

export const AXIS_COLORS = ['#ef4444', '#22c55e', '#3b82f6']
export const PARAM_COLORS = { theta: '#facc15', d: '#22d3ee', a: '#e879f9', alpha: '#a3e635' }

const ORANGE = '#f59e0b'
const STEEL = '#71717a'
const DARK = '#27272a'

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
function Rod({ from, to, radius, color, metalness = 0.4, roughness = 0.45 }) {
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
      <cylinderGeometry args={[radius, radius, len, 24]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

/** RGB = XYZ arrows of one frame, with its name. */
export function Axes({ size = 0.1, label, dim = false, labels = true }) {
  const r = size * 0.035
  return (
    <group>
      {[
        [0, 0, -Math.PI / 2],
        [0, 0, 0],
        [Math.PI / 2, 0, 0],
      ].map((rot, i) => (
        <group key={i} rotation={rot}>
          <mesh position={[0, size * 0.4, 0]}>
            <cylinderGeometry args={[r, r, size * 0.8, 10]} />
            <meshBasicMaterial color={AXIS_COLORS[i]} transparent opacity={dim ? 0.35 : 1} depthTest={!dim} />
          </mesh>
          <mesh position={[0, size * 0.9, 0]}>
            <coneGeometry args={[r * 2.6, size * 0.2, 14]} />
            <meshBasicMaterial color={AXIS_COLORS[i]} transparent opacity={dim ? 0.35 : 1} depthTest={!dim} />
          </mesh>
        </group>
      ))}
      {labels && label != null && (
        <Html position={[-size * 0.15, -size * 0.15, 0]} center zIndexRange={[10, 0]} className="pointer-events-none select-none">
          <span className="rounded bg-black/60 px-1 font-mono text-[10px] whitespace-nowrap text-white">{label}</span>
        </Html>
      )}
    </group>
  )
}

/** Joint housing on the joint axis (z of `m`): a drum for revolute, a sleeve for prismatic joints. */
function Joint({ m, type, active, scale }) {
  const color = active ? ORANGE : STEEL
  const r = 0.055 * scale
  return (
    <InFrame m={m}>
      {type === 'R' ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[r, r, r * 2.2, 32]} />
          <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
        </mesh>
      ) : (
        <mesh castShadow>
          <boxGeometry args={[r * 1.8, r * 1.8, r * 1.4]} />
          <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
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
      {Math.abs(angle) > 1e-4 && <Line points={pts} color={color} lineWidth={2.5} depthTest={false} />}
      <Html position={end} center zIndexRange={[20, 10]} className="pointer-events-none select-none">
        <span className="rounded px-1 font-mono text-[11px] font-semibold whitespace-nowrap" style={{ color, background: 'rgb(0 0 0 / 0.65)' }}>
          {label}
        </span>
      </Html>
    </InFrame>
  )
}

/** Measured segment for d or a. */
function Dimension({ from, to, color, label }) {
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={3} depthTest={false} />
      <Html position={mid} center zIndexRange={[20, 10]} className="pointer-events-none select-none">
        <span className="rounded px-1 font-mono text-[11px] font-semibold whitespace-nowrap" style={{ color, background: 'rgb(0 0 0 / 0.65)' }}>
          {label}
        </span>
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
 */
export function Robot({ fk, rows, convention, selected, showAxes, showLabels, scale = 1 }) {
  const pts = fk.frames.map(position)
  const mids = fk.links.map((l) => position(l.mid))
  const rodR = 0.032 * scale
  return (
    <group>
      {/* Base plate under frame 0 */}
      <mesh position={[0, 0, 0.03 * scale]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.11 * scale, 0.13 * scale, 0.06 * scale, 40]} />
        <meshStandardMaterial color={DARK} metalness={0.5} roughness={0.5} />
      </mesh>
      {fk.links.map((l, i) => (
        <group key={i}>
          <Rod from={pts[i]} to={mids[i]} radius={rodR} color={ORANGE} />
          <Rod from={mids[i]} to={pts[i + 1]} radius={rodR} color={ORANGE} />
          <Joint m={l.axis} type={rows[i].type} active={i === selected} scale={scale} />
        </group>
      ))}
      {/* Tool flange */}
      <InFrame m={fk.tool}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.008 * scale]} castShadow>
          <cylinderGeometry args={[0.035 * scale, 0.035 * scale, 0.016 * scale, 24]} />
          <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
        </mesh>
      </InFrame>
      {showAxes &&
        fk.frames.map((m, i) => {
          const last = i === fk.frames.length - 1
          const highlight = selected == null || i === selected || i === selected + 1
          return (
            <InFrame key={i} m={m}>
              <Axes size={(last ? 0.13 : 0.1) * scale} label={last ? `O${i} (uç)` : `O${i}`} dim={!highlight} labels={showLabels} />
            </InFrame>
          )
        })}
    </group>
  )
}

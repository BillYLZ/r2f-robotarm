import { useMemo } from 'react'
import { Grid, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { AXIS_COLORS, Chip } from './Robot.jsx'
import { useSceneTheme } from '@/theme.js'

const ACCENT = '#ff8a1f'

/** Sky dome with a vertical gradient: zenith → horizon → ground, so the horizon line reads clearly. */
function Sky({ top, horizon, bottom }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.55, h)) : mix(horizon, bottom, smoothstep(0.0, 0.08, -h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [top, horizon, bottom],
  )
  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[60, 48, 24]} />
    </mesh>
  )
}

function circle(r, y = 0.0008, n = 128) {
  const pts = []
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * Math.PI * 2
    pts.push([r * Math.cos(t), y, r * Math.sin(t)])
  }
  return pts
}

/**
 * The ground: an endless floor that fades into the horizon, and a round work cell platform under the robot
 * with a fine grid, distance rings every 0.5 m, an accent edge and the base x / y axes.
 */
export default function Stage({ reach }) {
  const t = useSceneTheme()
  const R = Math.max(0.75, Math.ceil(reach * 0.8 * 2) / 2) // platform radius, rounded up to 0.5 m
  const rings = useMemo(() => {
    const out = []
    for (let r = 0.5; r < R - 1e-6; r += 0.5) out.push(r)
    return out
  }, [R])
  return (
    <group>
      <Sky top={t.skyTop} horizon={t.horizon} bottom={t.floor} />
      <fog attach="fog" args={[t.horizon, 8, 32]} />

      {/* endless floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={t.floor} roughness={0.95} metalness={0} />
      </mesh>

      {/* work cell platform, top face at y = 0 */}
      <mesh position={[0, -0.01, 0]} receiveShadow>
        <cylinderGeometry args={[R, R + 0.02, 0.02, 128]} />
        <meshStandardMaterial color={t.platform} roughness={0.75} metalness={0.05} />
      </mesh>
      <Grid
        position={[0, 0.0004, 0]}
        infiniteGrid
        fadeFrom={0}
        fadeDistance={R * 1.05}
        fadeStrength={4}
        cellSize={0.05}
        cellThickness={0.8}
        sectionSize={0.5}
        sectionThickness={1.2}
        cellColor={t.cell}
        sectionColor={t.section}
      />
      {rings.map((r) => (
        <group key={r}>
          <Line points={circle(r)} color={t.section} lineWidth={1} transparent opacity={0.8} />
          <Html position={[r * Math.SQRT1_2, 0.001, r * Math.SQRT1_2]} center zIndexRange={[5, 0]} className="pointer-events-none select-none">
            <Chip className="opacity-80">{r.toFixed(1)} m</Chip>
          </Html>
        </group>
      ))}
      <Line points={circle(R, 0.001)} color={ACCENT} lineWidth={2} />
      <Line points={circle(R + 0.05, -0.012)} color={t.section} lineWidth={1} transparent opacity={0.6} />

      {/* base x (red) and y (green) on the floor; three.js −z is DH +y */}
      <Line points={[[0, 0.001, 0], [R, 0.001, 0]]} color={AXIS_COLORS[0]} lineWidth={1.5} transparent opacity={t.floorAxes} />
      <Line points={[[0, 0.001, 0], [0, 0.001, -R]]} color={AXIS_COLORS[1]} lineWidth={1.5} transparent opacity={t.floorAxes} />
    </group>
  )
}

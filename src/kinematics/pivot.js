import { chain, rotX, rotY, rotZ, transZ } from './mat4.js'
import { DEG } from './dh.js'

/** Flange → tool tip: a straight tool of `length` meters along the flange z axis. */
export const toolMatrix = (length) => transZ(length)

const smooth = (u) => u * u * (3 - 2 * u)
/** 0 → 1 → 0 envelope with soft ends, so each maneuver starts and stops at the start orientation. */
const swell = (u) => Math.sin(Math.PI * u)

/**
 * TCP rotation program: the tool tip stays where it is, only the tool orientation changes.
 * Each step returns the rotation applied in the tool frame at phase u ∈ [0, 1].
 */
export const PIVOT_STEPS = [
  { id: 'tiltX', name: 'X ekseni etrafında eğme', rot: (u, a) => rotX(a * Math.sin(2 * Math.PI * u)) },
  { id: 'tiltY', name: 'Y ekseni etrafında eğme', rot: (u, a) => rotY(a * Math.sin(2 * Math.PI * u)) },
  {
    id: 'cone',
    name: 'Koni (tool ekseni daire çizer)',
    // Precession: the tilt direction turns once around while the tilt itself swells in and out.
    rot: (u, a) => {
      const psi = 2 * Math.PI * smooth(u)
      return chain(rotZ(psi), rotX(a * swell(u)), rotZ(-psi))
    },
  },
  { id: 'spin', name: 'Tool ekseni etrafında dönme', rot: (u, a, spin) => rotZ(spin * Math.sin(2 * Math.PI * u)) },
]

/** Goal pose of the tool tip at program time `t` (0 … PIVOT_STEPS.length). */
export function pivotGoal(start, t, { tilt, spin }) {
  const i = Math.min(PIVOT_STEPS.length - 1, Math.max(0, Math.floor(t)))
  const u = t - i
  return { goal: chain(start, PIVOT_STEPS[i].rot(u, tilt * DEG, spin * DEG)), step: i }
}

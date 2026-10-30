import { chain, identity, multiply, rotX, rotZ, transX, transZ } from './mat4.js'

export const DEG = Math.PI / 180

/**
 * A DH row: { type: 'R' | 'P', theta, d, a, alpha, min, max }.
 * theta and alpha are degrees, d and a meters. For a revolute joint the joint value q (degrees)
 * is added to theta, for a prismatic one q (meters) is added to d, so theta / d are the offsets.
 * min / max limit q in the same units.
 */

/** Effective theta (rad) and d (m) of a row for joint value q. */
export function jointParams(row, q) {
  const theta = (row.theta + (row.type === 'R' ? q : 0)) * DEG
  const d = row.d + (row.type === 'P' ? q : 0)
  return { theta, d, a: row.a, alpha: row.alpha * DEG }
}

/**
 * Link transform from frame i-1 to frame i.
 * standard (Denavit–Hartenberg): Rz(θ) · Tz(d) · Tx(a) · Rx(α)
 * modified (Craig):             Rx(α) · Tx(a) · Rz(θ) · Tz(d)   (α, a of this row are α_{i-1}, a_{i-1})
 */
export function linkMatrix(row, q, convention = 'standard') {
  const { theta, d, a, alpha } = jointParams(row, q)
  return convention === 'modified'
    ? chain(rotX(alpha), transX(a), rotZ(theta), transZ(d))
    : chain(rotZ(theta), transZ(d), transX(a), rotX(alpha))
}

/**
 * Forward kinematics.
 * Returns `frames` (T_0^0 … T_0^n, n+1 matrices) and per row the in-between frames the scene needs:
 *  - `mid`:   frame after the first half of the link transform (standard: after Rz·Tz, modified: after Rx·Tx),
 *             so a link is drawn frames[i] → mid → frames[i+1]
 *  - `thetaFrame`: frame whose xy plane holds the θ arc (rotation about z, starting at x)
 *  - `alphaFrame`: frame whose yz plane holds the α arc (rotation about x, starting at z)
 *  - `axis`:  frame whose z axis is this joint's axis (standard: z_{i-1}, modified: z_i)
 */
export function forward(rows, q, convention = 'standard', base = identity()) {
  const frames = [base]
  const links = []
  let T = base
  rows.forEach((row, i) => {
    const { theta, d, a, alpha } = jointParams(row, q[i] ?? 0)
    if (convention === 'modified') {
      const alphaFrame = T
      const thetaFrame = chain(T, rotX(alpha), transX(a))
      const mid = thetaFrame
      const next = chain(thetaFrame, rotZ(theta), transZ(d))
      links.push({ mid, thetaFrame, alphaFrame, axis: next, theta, d, a, alpha })
      T = next
    } else {
      const thetaFrame = T
      const mid = chain(T, rotZ(theta), transZ(d))
      const alphaFrame = multiply(mid, transX(a))
      const next = multiply(alphaFrame, rotX(alpha))
      links.push({ mid, thetaFrame, alphaFrame, axis: T, theta, d, a, alpha })
      T = next
    }
    frames.push(T)
  })
  return { frames, links, tool: T }
}

/** Flange pose, or the tool tip when a tool transform (flange → TCP) is given. */
export function endEffector(rows, q, convention, tool) {
  const T = forward(rows, q, convention).tool
  return tool ? multiply(T, tool) : T
}

export const clampJoint = (row, v) => Math.min(row.max, Math.max(row.min, v))

export const defaultLimits = (type) => (type === 'P' ? { min: 0, max: 0.5 } : { min: -180, max: 180 })

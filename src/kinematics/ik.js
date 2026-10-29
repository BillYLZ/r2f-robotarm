import { column, position } from './mat4.js'
import { clampJoint, DEG, endEffector } from './dh.js'

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Orientation error between two tool frames as a rotation vector (≈ axis · angle for small errors):
 * ½ Σ x_cur × x_goal. Zero when the rotations match.
 */
export function orientationError(cur, goal) {
  const e = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const v = cross(column(cur, c), column(goal, c))
    for (let k = 0; k < 3; k++) e[k] += v[k] / 2
  }
  return e
}

/**
 * Geometric Jacobian by finite differences: 6 × n, rows vx vy vz wx wy wz.
 * Columns are per unit of the joint value as the UI uses it (degree or meter), so a step dq can be added directly.
 */
export function jacobian(rows, q, convention) {
  const T = endEffector(rows, q, convention)
  const p = position(T)
  const J = Array.from({ length: 6 }, () => new Array(rows.length).fill(0))
  rows.forEach((row, j) => {
    const h = row.type === 'R' ? 1e-3 : 1e-5
    const qh = q.slice()
    qh[j] += h
    const Th = endEffector(rows, qh, convention)
    const ph = position(Th)
    const w = orientationError(T, Th)
    for (let k = 0; k < 3; k++) {
      J[k][j] = (ph[k] - p[k]) / h
      J[3 + k][j] = w[k] / h
    }
  })
  return J
}

/** Solves A x = b for a small square A (Gaussian elimination with partial pivoting). */
export function solve(A, b) {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    const piv = M[c][c] || 1e-12
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / (M[r][r] || 1e-12)
  }
  return x
}

/** J · Jᵀ for the selected task rows. */
const jjt = (J) => J.map((ri) => J.map((rj) => ri.reduce((s, v, k) => s + v * rj[k], 0)))

function determinant(A) {
  const n = A.length
  const M = A.map((r) => r.slice())
  let det = 1
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-15) return 0
    if (p !== c) {
      ;[M[c], M[p]] = [M[p], M[c]]
      det = -det
    }
    det *= M[c][c]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return det
}

/**
 * Yoshikawa manipulability √det(J Jᵀ) with revolute columns per radian.
 * Uses the full 6-D Jacobian when the arm has ≥ 6 joints, otherwise only the first min(3, n) position rows.
 * Drops to 0 at a singularity.
 */
export function manipulability(rows, q, convention) {
  const J = jacobian(rows, q, convention).map((r) => r.map((v, j) => (rows[j].type === 'R' ? v / DEG : v)))
  const task = rows.length >= 6 ? J : J.slice(0, Math.min(3, rows.length))
  return Math.sqrt(Math.max(0, determinant(jjt(task))))
}

/**
 * Damped least squares IK: dq = Jᵀ (J Jᵀ + λ² I)⁻¹ e, repeated until the tool reaches `goal`.
 * With `orientation` off only the position rows are used, so arms with < 6 joints still reach a point.
 * Joint limits are respected by clamping each step.
 */
export function solveIK(rows, q0, goal, { convention, orientation = true, iterations = 120, lambda = 0.05, tol = 1e-4 } = {}) {
  let q = q0.slice()
  const goalP = position(goal)
  let err = Infinity
  for (let it = 0; it < iterations; it++) {
    const T = endEffector(rows, q, convention)
    const p = position(T)
    const e = [goalP[0] - p[0], goalP[1] - p[1], goalP[2] - p[2]]
    if (orientation) e.push(...orientationError(T, goal))
    err = Math.hypot(...e)
    if (err < tol) break
    const J = jacobian(rows, q, convention).slice(0, e.length)
    // Scale revolute columns to radians so λ means the same for every joint type.
    const Js = J.map((r) => r.map((v, j) => (rows[j].type === 'R' ? v / DEG : v)))
    const A = jjt(Js).map((r, i) => r.map((v, k) => v + (i === k ? lambda * lambda : 0)))
    const y = solve(A, e)
    q = q.map((v, j) => {
      let dq = Js.reduce((s, r, i) => s + r[j] * y[i], 0)
      if (rows[j].type === 'R') dq = Math.max(-10, Math.min(10, dq / DEG))
      else dq = Math.max(-0.05, Math.min(0.05, dq))
      return clampJoint(rows[j], v + dq)
    })
  }
  return { q, error: err, ok: err < 1e-3 }
}

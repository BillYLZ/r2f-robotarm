import { defaultLimits } from './kinematics/dh.js'

/**
 * A robot as link text, written after `#` in the address:
 *
 *   std:R,0,0.089,0,90;R,0,0,-0.425,0@0,-90
 *
 * - `std:` or `mdh:` picks standard or modified DH (optional, default std)
 * - rows are separated by `;`, each row is `type,θ,d,a,α[,min,max]` (degrees and meters)
 * - after `@` the joint values, comma separated (optional)
 * - `+0.66` before the convention lifts the base above the floor (optional)
 */
const round = (v) => String(Math.round(v * 1e6) / 1e6)

export function encodeRobot({ rows, q, convention, base }) {
  const body = rows
    .map((r) => {
      const lim = defaultLimits(r.type)
      const fields = [r.type, r.theta, r.d, r.a, r.alpha].map((v, i) => (i ? round(v) : v))
      if (r.min !== lim.min || r.max !== lim.max) fields.push(round(r.min), round(r.max))
      return fields.join(',')
    })
    .join(';')
  const lift = base ? `+${round(base)}` : ''
  return `${lift}${convention === 'modified' ? 'mdh' : 'std'}:${body}@${q.map(round).join(',')}`
}

export function decodeRobot(text) {
  let s = decodeURIComponent(text || '').trim().replace(/^#/, '')
  if (!s) return null
  let base = 0
  const lift = s.match(/^\+([\d.]+)/)
  if (lift) {
    base = Number(lift[1])
    s = s.slice(lift[0].length)
  }
  let convention = 'standard'
  const head = s.match(/^(std|mdh):/)
  if (head) {
    convention = head[1] === 'mdh' ? 'modified' : 'standard'
    s = s.slice(head[0].length)
  }
  const [body, qs] = s.split('@')
  const rows = []
  for (const part of body.split(';').filter(Boolean)) {
    const f = part.split(',')
    const type = f[0]?.toUpperCase()
    if (type !== 'R' && type !== 'P') return null
    const nums = f.slice(1).map(Number)
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null
    const [theta, d, a, alpha, min, max] = nums
    const lim = defaultLimits(type)
    rows.push({ type, theta, d, a, alpha, min: min ?? lim.min, max: max ?? lim.max })
  }
  if (!rows.length || rows.length > 12) return null
  const given = (qs || '').split(',').filter((v) => v !== '').map(Number)
  const q = rows.map((r, i) => {
    const v = given[i]
    return Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : Math.min(r.max, Math.max(r.min, 0))
  })
  return { rows, q, convention, base }
}

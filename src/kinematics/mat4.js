// Minimal 4x4 homogeneous transforms as row-major arrays of 16 numbers.
// Row-major matches how DH matrices are written on paper and THREE.Matrix4.set().

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function multiply(a, b) {
  const out = new Array(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]
      out[r * 4 + c] = s
    }
  }
  return out
}

export const chain = (...ms) => ms.reduce(multiply, identity())

export function rotZ(t) {
  const c = Math.cos(t), s = Math.sin(t)
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

export function rotX(t) {
  const c = Math.cos(t), s = Math.sin(t)
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
}

export const transZ = (d) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, d, 0, 0, 0, 1]
export const transX = (a) => [1, 0, 0, a, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export const position = (m) => [m[3], m[7], m[11]]
export const column = (m, c) => [m[c], m[4 + c], m[8 + c]]

/** ZYX Euler angles (roll about X, pitch about Y, yaw about Z), in radians. */
export function rpy(m) {
  const pitch = Math.atan2(-m[8], Math.hypot(m[0], m[4]))
  if (Math.abs(Math.cos(pitch)) < 1e-9) {
    // Gimbal lock: roll and yaw share one axis, put it all into yaw.
    return [0, pitch, Math.atan2(-m[1], m[5])]
  }
  return [Math.atan2(m[9], m[10]), pitch, Math.atan2(m[4], m[0])]
}

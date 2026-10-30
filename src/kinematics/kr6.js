import { chain, rotX, rotY, rotZ, translate } from './mat4.js'
import { DEG } from './dh.js'

/**
 * KUKA KR 6 R900 sixx as described by the ROS-Industrial URDF (kuka_experimental / kuka_kr6_support).
 * Each joint: origin offset from the parent link, rotation axis (±x, ±y, ±z), mesh of the child link.
 * The meshes are drawn with this URDF chain, so they match the real robot exactly.
 */
const JOINTS = [
  { origin: [0, 0, 0.4], axis: ['z', -1] },
  { origin: [0.025, 0, 0], axis: ['y', 1] },
  { origin: [0.455, 0, 0], axis: ['y', 1] },
  { origin: [0, 0, 0.035], axis: ['x', -1] },
  { origin: [0.42, 0, 0], axis: ['y', 1] },
  { origin: [0.08, 0, 0], axis: ['x', -1] },
]

export const KR6_MESHES = ['base_link', 'link_1', 'link_2', 'link_3', 'link_4', 'link_5', 'link_6']

/**
 * DH joint value → KUKA axis value (A1…A6). The DH table in presets.js puts z_{i-1} on each URDF axis;
 * where the URDF axis points the other way (A1 down, A4 and A6 backwards) the sign flips.
 */
export const KR6_SIGN = [-1, 1, 1, -1, 1, -1]

const ROT = { x: rotX, y: rotY, z: rotZ }

/** Poses of base_link, link_1 … link_6 in the base frame for DH joint values `q` (degrees). */
export function kr6LinkPoses(q) {
  let T = translate(0, 0, 0)
  const poses = [T]
  JOINTS.forEach((j, i) => {
    const [ax, dir] = j.axis
    const a = KR6_SIGN[i] * (q[i] ?? 0) * DEG * dir
    T = chain(T, translate(...j.origin), ROT[ax](a))
    poses.push(T)
  })
  return poses
}

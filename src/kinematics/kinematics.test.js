import { test } from 'node:test'
import assert from 'node:assert/strict'
import { endEffector, forward, linkMatrix } from './dh.js'
import { position } from './mat4.js'
import { manipulability, solveIK } from './ik.js'
import { presetById, PRESETS } from './presets.js'
import { decodeRobot, encodeRobot } from '../dhcode.js'

const near = (actual, expected, eps = 1e-4) =>
  expected.forEach((v, i) => assert.ok(Math.abs(actual[i] - v) < eps, `index ${i}: ${actual[i]} ≠ ${v}`))

const zeros = (p) => p.rows.map(() => 0)
const tip = (p, q = zeros(p)) => position(endEffector(p.rows, q, p.convention))

test('standard DH row is Rz·Tz·Tx·Rx', () => {
  const m = linkMatrix({ type: 'R', theta: 90, d: 0.1, a: 0.2, alpha: 90 }, 0)
  // x_i = y_{i-1}, z_i = -x_{i-1}... written out from the textbook matrix
  near(m, [0, 0, 1, 0, 1, 0, 0, 0.2, 0, 1, 0, 0.1, 0, 0, 0, 1], 1e-12)
})

test('joint value adds to θ (revolute) or d (prismatic)', () => {
  near(linkMatrix({ type: 'R', theta: 30, d: 0, a: 1, alpha: 0 }, 60), linkMatrix({ type: 'R', theta: 90, d: 0, a: 1, alpha: 0 }, 0), 1e-12)
  near(linkMatrix({ type: 'P', theta: 0, d: 0.1, a: 0, alpha: 0 }, 0.2), linkMatrix({ type: 'P', theta: 0, d: 0.3, a: 0, alpha: 0 }, 0), 1e-12)
})

test('UR5 at zero: x = a2 + a3, y = -(d4 + d6), z = d1 - d5', () => {
  near(tip(presetById('ur5')), [-0.81725, -0.19145, -0.005491])
})

test('PUMA 560 at zero matches Corke: (0.4521, -0.15005, 0.4318)', () => {
  near(tip(presetById('puma')), [0.4521, -0.15005, 0.4318])
})

test('ABB IRB 120 home: wrist forward, TCP at (0.374, 0, 0.630)', () => {
  near(tip(presetById('irb120')), [0.374, 0, 0.63])
})

test('2R planar: (l1 + l2, 0) and the textbook formula', () => {
  const p = presetById('planar2')
  near(tip(p), [0.7, 0, 0])
  const [a, b] = [30, 45].map((v) => (v * Math.PI) / 180)
  near(tip(p, [30, 45]), [0.4 * Math.cos(a) + 0.3 * Math.cos(a + b), 0.4 * Math.sin(a) + 0.3 * Math.sin(a + b), 0])
})

test('SCARA: prismatic joint moves the tool straight down', () => {
  const p = presetById('scara')
  near(tip(p, [0, 0, 0, 0]), [0.65, 0, 0.35])
  near(tip(p, [0, 0, 0.2, 0]), [0.65, 0, 0.15])
})

test('PUMA standard and Craig tables put the wrist center in the same place', () => {
  // Wrist center = origin of frame 4 in standard DH, frame 4 in modified DH (both at the wrist).
  const std = forward(presetById('puma').rows, [0, 0, 0, 0, 0, 0], 'standard')
  const mdh = forward(presetById('puma-mdh').rows, [0, 0, 0, 0, 0, 0], 'modified')
  const a = position(std.frames[4])
  const b = position(mdh.frames[4])
  near([a[0], Math.abs(a[1]), Math.abs(a[2])], [b[0], Math.abs(b[1]), Math.abs(b[2])])
})

test('forward returns n + 1 frames and one link per row', () => {
  for (const p of PRESETS) {
    const fk = forward(p.rows, p.home, p.convention)
    assert.equal(fk.frames.length, p.rows.length + 1)
    assert.equal(fk.links.length, p.rows.length)
  }
})

test('IK reaches a pose produced by FK (6 joints, position + orientation)', () => {
  const p = presetById('irb120')
  const goal = endEffector(p.rows, [20, 10, -15, 30, 40, -20], p.convention)
  const { ok, q } = solveIK(p.rows, p.home, goal, { convention: p.convention })
  assert.ok(ok)
  near(endEffector(p.rows, q, p.convention), goal, 1e-3)
})

test('IK position only works for a 2R arm', () => {
  const p = presetById('planar2')
  const goal = endEffector(p.rows, [60, -30], p.convention)
  const { ok } = solveIK(p.rows, [10, 10], goal, { convention: p.convention, orientation: false })
  assert.ok(ok)
})

test('manipulability drops to zero at a singularity', () => {
  const p = presetById('planar2')
  assert.ok(manipulability(p.rows, [0, 0], p.convention) < 1e-6) // stretched out
  assert.ok(manipulability(p.rows, [0, 90], p.convention) > 0.05)
})

test('link code round trip', () => {
  for (const p of PRESETS) {
    const robot = { rows: p.rows, q: p.home, convention: p.convention, base: p.base }
    const back = decodeRobot('#' + encodeRobot(robot))
    assert.deepEqual(back.rows, p.rows)
    assert.deepEqual(back.q, p.home)
    assert.equal(back.convention, p.convention)
    assert.equal(back.base, p.base)
  }
})

test('link code: short form and bad input', () => {
  const r = decodeRobot('R,0,0,0.4,0;R,0,0,0.3,0@45')
  assert.equal(r.rows.length, 2)
  assert.deepEqual(r.q, [45, 0])
  assert.equal(decodeRobot('X,1,2,3,4'), null)
  assert.equal(decodeRobot('R,1,2'), null)
  assert.equal(decodeRobot(''), null)
})

test('KR6: DH frames ride on the URDF links (mesh offsets constant), flange matches', async () => {
  const { kr6LinkPoses } = await import('./kr6.js')
  const { invertRigid, multiply } = await import('./mat4.js')
  const p = presetById('kr6')
  const offsets = (q) => {
    const fk = forward(p.rows, q, p.convention)
    const U = kr6LinkPoses(q)
    return U.map((u, i) => multiply(invertRigid(fk.frames[i]), u))
  }
  const ref = offsets([0, 0, 0, 0, 0, 0])
  for (let k = 0; k < 20; k++) {
    const q = p.rows.map((r) => r.min + Math.random() * (r.max - r.min))
    offsets(q).forEach((o, i) => near(o, ref[i], 1e-9))
    near(position(forward(p.rows, q, p.convention).tool), position(kr6LinkPoses(q)[6]), 1e-9)
  }
})

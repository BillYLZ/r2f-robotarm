import { defaultLimits } from './dh.js'

const R = (theta, d, a, alpha, min = -180, max = 180) => ({ type: 'R', theta, d, a, alpha, min, max })
const P = (theta, d, a, alpha, min = 0, max = 0.5) => ({ type: 'P', theta, d, a, alpha, min, max })

/**
 * Ready-made arms. Angles in degrees, lengths in meters.
 * `base` lifts the base frame above the floor (only for the scene, not part of the DH table).
 * `home` is the joint vector shown when the preset is picked.
 */
export const PRESETS = [
  {
    id: 'ur5',
    name: 'UR5',
    description: 'Universal Robots, 6 eksen, işbirlikçi robot',
    convention: 'standard',
    base: 0,
    rows: [
      R(0, 0.089159, 0, 90, -360, 360),
      R(0, 0, -0.425, 0, -360, 360),
      R(0, 0, -0.39225, 0, -360, 360),
      R(0, 0.10915, 0, 90, -360, 360),
      R(0, 0.09465, 0, -90, -360, 360),
      R(0, 0.0823, 0, 0, -360, 360),
    ],
    home: [0, -90, 90, -90, -90, 0],
  },
  {
    id: 'kr6',
    name: 'KUKA KR 6 R900 sixx',
    description: 'Gerçek 3B model (KR AGILUS), 6 eksen',
    convention: 'standard',
    base: 0,
    model: 'kr6',
    // z_{i-1} on each URDF joint axis; A1, A4, A6 have the opposite sign of the KUKA axes (see kr6.js).
    rows: [
      R(0, 0.4, 0.025, -90, -170, 170),
      R(0, 0, 0.455, 0, -190, 45),
      R(-90, 0, 0.035, -90, -120, 156),
      R(0, 0.42, 0, 90, -185, 185),
      R(0, 0, 0, -90, -120, 120),
      R(0, 0.08, 0, 0, -350, 350),
    ],
    home: [0, -90, 90, 0, 30, 0],
  },
  {
    id: 'irb120',
    name: 'ABB IRB 120',
    description: 'Küçük endüstriyel robot, küresel bilek',
    convention: 'standard',
    base: 0,
    rows: [
      R(0, 0.29, 0, -90, -165, 165),
      R(-90, 0, 0.27, 0, -110, 110),
      R(0, 0, 0.07, -90, -110, 70),
      R(0, 0.302, 0, 90, -160, 160),
      R(0, 0, 0, -90, -120, 120),
      R(180, 0.072, 0, 0, -400, 400),
    ],
    home: [0, 0, 0, 0, 30, 0],
  },
  {
    id: 'puma',
    name: 'PUMA 560',
    description: 'Klasik ders kitabı robotu (standart DH)',
    convention: 'standard',
    base: 0.6604,
    rows: [
      R(0, 0, 0, 90, -160, 160),
      R(0, 0, 0.4318, 0, -225, 45),
      R(0, 0.15005, 0.0203, -90, -45, 225),
      R(0, 0.4318, 0, 90, -110, 170),
      R(0, 0, 0, -90, -100, 100),
      R(0, 0, 0, 0, -266, 266),
    ],
    home: [0, -45, 180, 0, 45, 0],
  },
  {
    id: 'puma-mdh',
    name: 'PUMA 560 (Craig)',
    description: 'Aynı robot, modified DH tablosu',
    convention: 'modified',
    base: 0.6604,
    rows: [
      R(0, 0, 0, 0, -160, 160),
      R(0, 0, 0, -90, -225, 45),
      R(0, 0.15005, 0.4318, 0, -45, 225),
      R(0, 0.4318, 0.0203, -90, -110, 170),
      R(0, 0, 0, 90, -100, 100),
      R(0, 0, 0, -90, -266, 266),
    ],
    home: [0, -45, 0, 0, -45, 0],
  },
  {
    id: 'stanford',
    name: 'Stanford Arm',
    description: '5 döner + 1 prizmatik eklem (RRP küresel kol)',
    convention: 'standard',
    base: 0,
    rows: [
      R(0, 0.412, 0, -90),
      R(0, 0.154, 0, 90),
      P(0, 0, 0, 0, 0.2, 0.8),
      R(0, 0, 0, -90),
      R(0, 0, 0, 90),
      R(0, 0.263, 0, 0),
    ],
    home: [0, 45, 0.4, 0, 45, 0],
  },
  {
    id: 'scara',
    name: 'SCARA',
    description: 'Montaj robotu: 2 döner, 1 dikey prizmatik, 1 döner bilek',
    convention: 'standard',
    base: 0,
    rows: [
      R(0, 0.4, 0.35, 0, -130, 130),
      R(0, 0, 0.3, 180, -145, 145),
      P(0, 0, 0, 0, 0, 0.3),
      R(0, 0.05, 0, 0, -360, 360),
    ],
    home: [30, 60, 0.1, 0],
  },
  {
    id: 'planar2',
    name: '2R düzlemsel',
    description: 'En basit kol: iki döner eklem, xy düzleminde',
    convention: 'standard',
    base: 0.3,
    rows: [R(0, 0, 0.4, 0), R(0, 0, 0.3, 0)],
    home: [30, 45],
  },
]

export const presetById = (id) => PRESETS.find((p) => p.id === id)

export const newRow = (type = 'R') => ({ type, theta: 0, d: 0, a: 0.2, alpha: 0, ...defaultLimits(type) })

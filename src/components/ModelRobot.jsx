import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import * as THREE from 'three'
import { KR6_MESHES, kr6LinkPoses } from '@/kinematics/kr6.js'
import { InFrame } from './Robot.jsx'

const url = (name) => `${import.meta.env.BASE_URL}models/kr6/${name}.dae`

/**
 * Fine noise used as bump and roughness map: gives the paint a slight orange-peel look
 * and breaks up the reflections like on a real powder-coated casting.
 */
function makeNoiseTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const v = 150 + Math.random() * 60
    img.data.set([v, v, v, 255], i * 4)
  }
  ctx.putImageData(img, 0, 0)
  // Soften the grain so it reads as orange peel rather than sand.
  ctx.filter = 'blur(1.2px)'
  ctx.drawImage(canvas, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

/** The CAD meshes have no UVs: project along the dominant normal axis (box mapping), 1 repeat per `cell` meters. */
function addBoxUVs(geometry, cell = 0.04) {
  const pos = geometry.attributes.position
  const nor = geometry.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))]
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    const [u, v] = n[0] >= n[1] && n[0] >= n[2] ? [y, z] : n[1] >= n[2] ? [x, z] : [x, y]
    uv[i * 2] = u / cell
    uv[i * 2 + 1] = v / cell
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** All meshes of a Collada scene merged into the file's own (Z-up, meter) coordinates. */
function bakeGeometries(dae) {
  const root = dae.scene
  root.rotation.set(0, 0, 0) // the loader turns Z-up files to Y-up; our robot group is already Z-up
  root.scale.set(1, 1, 1)
  root.updateMatrixWorld(true)
  const out = []
  root.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld)
    if (!g.attributes.normal) g.computeVertexNormals()
    addBoxUVs(g)
    out.push(g)
  })
  return out
}

function useMaterials() {
  return useMemo(() => {
    const noise = makeNoiseTexture()
    const paint = new THREE.MeshPhysicalMaterial({
      color: '#f26b0f', // close to KUKA orange
      roughness: 0.42,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      roughnessMap: noise,
      bumpMap: noise,
      bumpScale: 0.35,
      sheen: 0.2,
      sheenColor: new THREE.Color('#ff9a4d'),
    })
    const dark = new THREE.MeshPhysicalMaterial({
      color: '#1c1e22',
      roughness: 0.55,
      metalness: 0.35,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
      roughnessMap: noise,
      bumpMap: noise,
      bumpScale: 0.5,
    })
    return { paint, dark }
  }, [])
}

/**
 * KUKA KR 6 R900 sixx drawn from its real visual meshes (ROS-Industrial, Apache-2.0).
 * Link poses come from the URDF chain, driven by the same DH joint values as the rest of the app.
 */
export default function ModelRobot({ q }) {
  const daes = useLoader(ColladaLoader, KR6_MESHES.map(url))
  const geometries = useMemo(() => daes.map(bakeGeometries), [daes])
  const { paint, dark } = useMaterials()
  const poses = useMemo(() => kr6LinkPoses(q), [q])
  return (
    <group>
      {geometries.map((gs, i) => (
        <InFrame key={KR6_MESHES[i]} m={poses[i]}>
          {gs.map((g, k) => (
            <mesh key={k} geometry={g} material={i === 0 || i === 6 ? dark : paint} castShadow receiveShadow />
          ))}
        </InFrame>
      ))}
    </group>
  )
}

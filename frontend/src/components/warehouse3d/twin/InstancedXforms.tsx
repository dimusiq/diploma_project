import { useLayoutEffect, useRef } from "react"
import {
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  Object3D,
  Sphere,
  Vector3,
} from "three"
import type { RackPartXform } from "@/components/warehouse3d/palletRackLayout.ts"

const dummy = new Object3D()
const WAREHOUSE_BOUNDS = new Sphere(new Vector3(0, 2, 0), 90)

export function InstancedXforms({
  geometry,
  material,
  items,
  limit,
  visible = true,
}: {
  geometry: BufferGeometry
  material: Material
  items: RackPartXform[]
  limit: number
  visible?: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const cap = Math.max(1, limit)

  useLayoutEffect(() => {
    const node = mesh.current
    if (!node) return
    const n = Math.min(items.length, cap)
    for (let i = 0; i < n; i += 1) {
      const item = items[i]
      if (!item) continue
      dummy.position.set(
        item.position[0],
        item.position[1],
        item.position[2],
      )
      const rot = item.rotation
      dummy.rotation.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)
      const scale = item.scale
      dummy.scale.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1)
      dummy.updateMatrix()
      node.setMatrixAt(i, dummy.matrix)
    }
    node.count = n
    node.instanceMatrix.needsUpdate = true
    node.boundingSphere = WAREHOUSE_BOUNDS
  }, [items, cap])

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, cap]}
      frustumCulled
      visible={visible}
      castShadow={false}
      receiveShadow={false}
    />
  )
}

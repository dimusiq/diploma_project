import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

export function SafetyBollard({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      <mesh
        geometry={TWIN_GEOM.post}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0.36, 0]}
        scale={[0.09, 0.72, 0.09]}
      />
      <mesh
        geometry={TWIN_GEOM.post}
        material={TWIN_MAT.safetyBlack}
        position={[0, 0.22, 0]}
        scale={[0.095, 0.08, 0.095]}
      />
      <mesh
        geometry={TWIN_GEOM.post}
        material={TWIN_MAT.safetyBlack}
        position={[0, 0.5, 0]}
        scale={[0.095, 0.08, 0.095]}
      />
    </group>
  )
}

export function SafetyBarrier({
  start,
  end,
  height = 0.9,
}: {
  start: [number, number, number]
  end: [number, number, number]
  height?: number
}) {
  const dx = end[0] - start[0]
  const dz = end[2] - start[2]
  const length = Math.hypot(dx, dz)
  if (length < 0.2) return null
  const cx = (start[0] + end[0]) / 2
  const cz = (start[2] + end[2]) / 2
  const rotY = Math.atan2(dx, dz)
  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, height, 0]}
        scale={[0.08, 0.06, length]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, height * 0.55, 0]}
        scale={[0.05, 0.05, length]}
      />
      {[-length / 2, length / 2].map((z) => (
        <mesh
          key={z}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.darkMetal}
          position={[0, height / 2, z]}
          scale={[0.07, height, 0.07]}
        />
      ))}
    </group>
  )
}

export function HazardBlock({
  position,
  size = [0.55, 0.22, 0.55],
}: {
  position: [number, number, number]
  size?: [number, number, number]
}) {
  return (
    <mesh
      geometry={TWIN_GEOM.box}
      material={TWIN_MAT.safetyYellow}
      position={[position[0], position[1] + size[1] / 2, position[2]]}
      scale={size}
    />
  )
}

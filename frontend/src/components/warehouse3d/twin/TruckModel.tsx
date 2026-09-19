import { Text } from "@react-three/drei"
import { truckWorldPose } from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

const CAB_WHEELS: Array<[number, number, number]> = [
  [-0.95, 0.42, 1.15],
  [0.95, 0.42, 1.15],
]
const TRAILER_WHEELS: Array<[number, number, number]> = [
  [-0.95, 0.42, -1.6],
  [0.95, 0.42, -1.6],
  [-0.95, 0.42, -3.4],
  [0.95, 0.42, -3.4],
  [-0.95, 0.42, -5.1],
  [0.95, 0.42, -5.1],
]

export function TruckModel({
  plate,
  direction,
  x,
  z,
  darkMode,
}: {
  plate: string
  direction: "inbound" | "outbound"
  x?: number
  z?: number
  darkMode?: boolean
}) {
  const posed =
    x != null && z != null ? truckWorldPose({ x, z, direction }) : null
  const rotY =
    posed?.rotationY ??
    (direction === "inbound" ? -Math.PI / 2 : Math.PI / 2)
  const cabinMat =
    direction === "inbound" ? TWIN_MAT.cabinBlue : TWIN_MAT.cabinGreen
  return (
    <group
      position={posed ? [posed.x, 0, posed.z] : [0, 0, 0]}
      rotation={[0, rotY, 0]}
    >
      <mesh
        geometry={TWIN_GEOM.box}
        material={cabinMat}
        position={[0, 1.35, 1.35]}
        scale={[2.2, 1.7, 1.9]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.glass}
        position={[0, 1.55, 2.28]}
        scale={[1.9, 0.7, 0.08]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.55, 1.2]}
        scale={[2.25, 0.35, 2.1]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, 1.85, -2.35]}
        scale={[2.45, 2.7, 7.1]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.42, -2.35]}
        scale={[2.2, 0.18, 6.8]}
      />
      {([-0.7, 0.7] as const).map((xOff) => (
        <mesh
          key={`door-${xOff}`}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.darkMetal}
          position={[xOff, 1.7, -5.92]}
          scale={[1.05, 2.2, 0.08]}
        />
      ))}
      {[...CAB_WHEELS, ...TRAILER_WHEELS].map((pos) => (
        <mesh
          key={pos.join(",")}
          geometry={TWIN_GEOM.wheel}
          material={TWIN_MAT.rubber}
          position={pos}
          rotation={[0, 0, Math.PI / 2]}
          scale={[0.42, 0.28, 0.42]}
        />
      ))}
      <Text
        position={[0, 3.35, -2.2]}
        fontSize={0.28}
        color={darkMode ? "#f8fafc" : "#0f172a"}
        anchorX="center"
      >
        {plate}
      </Text>
    </group>
  )
}

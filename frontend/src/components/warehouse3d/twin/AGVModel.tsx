import { PalletLoad } from "@/components/warehouse3d/PalletRackVisuals.tsx"
import { palletCargoVariant } from "@/components/warehouse3d/palletRackLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

const WHEEL_POS: Array<[number, number, number]> = [
  [-0.48, 0.12, 0.48],
  [0.48, 0.12, 0.48],
  [-0.48, 0.12, -0.48],
  [0.48, 0.12, -0.48],
]

export function AGVModel({
  color,
  carrying,
  selected,
  kind = "agv",
  status,
}: {
  color: string
  carrying?: boolean
  selected?: boolean
  kind?: "agv" | "amr"
  status?: string
}) {
  const bodyH = kind === "amr" ? 0.34 : 0.38
  const light =
    status === "fault" || status === "jam"
      ? "#ef4444"
      : status === "charging"
        ? "#22c55e"
        : status === "waiting"
          ? "#f97316"
          : color
  return (
    <group>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.16, 0]}
        scale={[1.28, 0.16, 1.28]}
      />
      <mesh position={[0, 0.28 + bodyH / 2, 0]}>
        <boxGeometry args={[1.18, bodyH, 1.18]} />
        <meshStandardMaterial
          color={color}
          metalness={0.45}
          roughness={0.38}
          emissive={color}
          emissiveIntensity={selected ? 0.22 : 0.06}
        />
      </mesh>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, 0.52, 0]}
        scale={[1.05, 0.06, 1.05]}
      />
      {WHEEL_POS.map((pos) => (
        <mesh
          key={pos.join(",")}
          geometry={TWIN_GEOM.wheel}
          material={TWIN_MAT.rubber}
          position={pos}
          rotation={[0, 0, Math.PI / 2]}
          scale={[0.12, 0.1, 0.12]}
        />
      ))}
      <mesh
        geometry={TWIN_GEOM.post}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.62, 0.42]}
        scale={[0.12, 0.1, 0.12]}
      />
      <mesh
        geometry={TWIN_GEOM.dome}
        material={TWIN_MAT.glass}
        position={[0, 0.7, 0.42]}
        scale={[0.14, 0.08, 0.14]}
      />
      <mesh position={[0.42, 0.58, -0.42]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial
          color={light}
          emissive={light}
          emissiveIntensity={0.8}
        />
      </mesh>
      {carrying && (
        <group position={[0, 0.58, 0]}>
          <PalletLoad
            variant={palletCargoVariant("agv-load")}
            maxHeight={0.7}
            lanes={1}
          />
        </group>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.05, 1.22, 24]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
      )}
    </group>
  )
}

import { PalletLoad } from "@/components/warehouse3d/PalletRackVisuals.tsx"
import { palletCargoVariant } from "@/components/warehouse3d/palletRackLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

const WHEEL_POS: Array<[number, number, number]> = [
  [-0.48, 0.22, 0.55],
  [0.48, 0.22, 0.55],
  [-0.48, 0.22, -0.62],
  [0.48, 0.22, -0.62],
]

export function ForkliftModel({
  color,
  carrying,
  selected,
}: {
  color: string
  carrying?: boolean
  selected?: boolean
}) {
  return (
    <group>
      <mesh position={[0, 0.42, -0.18]}>
        <boxGeometry args={[1.05, 0.42, 1.45]} />
        <meshStandardMaterial
          color={color}
          metalness={0.32}
          roughness={0.46}
          emissive={color}
          emissiveIntensity={selected ? 0.18 : 0.04}
        />
      </mesh>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.22, -0.1]}
        scale={[1.0, 0.08, 1.7]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.48, -0.82]}
        scale={[1.02, 0.55, 0.22]}
      />
      {([-0.42, 0.42] as const).map((x) =>
        ([-0.05, -0.7] as const).map((z) => (
          <mesh
            key={`${x}-${z}`}
            geometry={TWIN_GEOM.box}
            material={TWIN_MAT.steel}
            position={[x, 1.05, z]}
            scale={[0.05, 0.95, 0.05]}
          />
        )),
      )}
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, 1.54, -0.38]}
        scale={[0.95, 0.05, 0.78]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.72, -0.22]}
        scale={[0.32, 0.28, 0.32]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.glass}
        position={[0, 1.12, 0.12]}
        scale={[0.82, 0.42, 0.04]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, 0.95, 0.62]}
        scale={[0.12, 1.55, 0.1]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, 0.95, 0.78]}
        scale={[0.12, 1.55, 0.08]}
      />
      {([-0.28, 0.28] as const).map((x) => (
        <mesh
          key={`fork-${x}`}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.darkMetal}
          position={[x, carrying ? 0.42 : 0.16, 1.35]}
          scale={[0.12, 0.06, 1.15]}
        />
      ))}
      {WHEEL_POS.map((pos) => (
        <mesh
          key={pos.join(",")}
          geometry={TWIN_GEOM.wheel}
          material={TWIN_MAT.rubber}
          position={pos}
          rotation={[0, 0, Math.PI / 2]}
          scale={[0.22, 0.14, 0.22]}
        />
      ))}
      {carrying && (
        <group position={[0, 0.48, 1.2]}>
          <PalletLoad
            variant={palletCargoVariant("forklift-load")}
            maxHeight={0.75}
            lanes={1}
          />
        </group>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.35, 1.55, 24]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
      )}
    </group>
  )
}

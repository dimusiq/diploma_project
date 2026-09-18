import { Text } from "@react-three/drei"
import {
  PACKING_POINT,
  RECEIVING_STAGING,
  SHIPPING_STAGING,
} from "@/components/deviceServer/simLayout.ts"
import type { SimZone } from "@/components/deviceServer/simTypes.ts"
import {
  ZONE_LABELS,
  ZONE_TINTS,
  zoneSignWorldPos,
  zoneWorldRect,
} from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
import {
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

function ZoneSign({
  zone,
  darkMode,
}: {
  zone: SimZone
  darkMode?: boolean
}) {
  const pos = zoneSignWorldPos(zone)
  const label = ZONE_LABELS[zone.kind] ?? zone.code
  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 1.05, 0]}
        scale={[0.07, 2.1, 0.07]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 2.15, 0.04]}
        scale={[1.55, 0.36, 0.04]}
      />
      <Text
        position={[0, 2.15, 0.07]}
        fontSize={0.16}
        color={darkMode ? "#111827" : "#1c1917"}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  )
}

function Workstation({
  x,
  z,
  label,
}: {
  x: number
  z: number
  label: string
}) {
  return (
    <group position={[planToWorldX(x), 0, planToWorldZ(z)]}>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.46, 0]}
        scale={[2.4, 0.08, 1.2]}
      />
      {([-1.05, 1.05] as const).flatMap((ox) =>
        ([-0.5, 0.5] as const).map((oz) => (
          <mesh
            key={`${ox}-${oz}`}
            geometry={TWIN_GEOM.box}
            material={TWIN_MAT.steel}
            position={[ox, 0.22, oz]}
            scale={[0.08, 0.44, 0.08]}
          />
        )),
      )}
      <Text
        position={[0, 1.15, 0]}
        fontSize={0.18}
        color="#e2e8f0"
        anchorX="center"
      >
        {label}
      </Text>
    </group>
  )
}

export function WarehouseZone({
  zone,
  darkMode,
}: {
  zone: SimZone
  darkMode?: boolean
}) {
  const rect = zoneWorldRect(zone)
  const tint = ZONE_TINTS[zone.kind] ?? "#94a3b8"
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.x, 0.01, rect.z]}>
        <planeGeometry args={[rect.w, rect.d]} />
        <meshStandardMaterial
          color={tint}
          transparent
          opacity={darkMode ? 0.1 : 0.14}
          roughness={0.95}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[rect.x, 0.014, rect.z - rect.d / 2 + 0.04]}
        scale={[rect.w, 0.004, 0.06]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[rect.x, 0.014, rect.z + rect.d / 2 - 0.04]}
        scale={[rect.w, 0.004, 0.06]}
      />
      <ZoneSign zone={zone} darkMode={darkMode} />
      {zone.kind === "packing" && (
        <Workstation x={PACKING_POINT.x} z={PACKING_POINT.z} label="PACK" />
      )}
      {zone.kind === "receiving" && (
        <Workstation
          x={RECEIVING_STAGING.x}
          z={RECEIVING_STAGING.z}
          label="RECV"
        />
      )}
      {zone.kind === "shipping" && (
        <Workstation
          x={SHIPPING_STAGING.x}
          z={SHIPPING_STAGING.z}
          label="SHIP"
        />
      )}
    </group>
  )
}

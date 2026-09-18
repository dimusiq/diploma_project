import type { SimZone } from "@/components/deviceServer/simTypes.ts"
import { SafetyBarrier } from "@/components/warehouse3d/twin/SafetyBarrier.tsx"
import { chargingSlotPlanPositions, zoneWorldRect } from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
import {
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

function ChargingPost({
  x,
  z,
}: {
  x: number
  z: number
}) {
  return (
    <group position={[planToWorldX(x), 0, planToWorldZ(z)]}>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.7, 0]}
        scale={[0.28, 1.4, 0.22]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 1.35, 0.02]}
        scale={[0.32, 0.12, 0.26]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.forkliftYellow}
        position={[0.18, 0.55, 0]}
        scale={[0.08, 0.18, 0.08]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[1.1, 0.015, 0]}
        scale={[2.2, 0.01, 1.5]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyBlack}
        position={[1.1, 0.018, 0]}
        scale={[1.7, 0.008, 0.08]}
      />
    </group>
  )
}

export function ChargingStation({
  zone,
}: {
  zone: SimZone
  darkMode?: boolean
}) {
  const slots = chargingSlotPlanPositions(zone, 4)
  const rect = zoneWorldRect(zone)
  return (
    <group>
      {slots.map((slot, i) => (
        <ChargingPost key={`chg-${i}`} x={slot.x} z={slot.z} />
      ))}
      <SafetyBarrier
        start={[rect.x - rect.w / 2 + 0.4, 0, rect.z - rect.d / 2 + 0.3]}
        end={[rect.x + rect.w / 2 - 0.4, 0, rect.z - rect.d / 2 + 0.3]}
      />
      <SafetyBarrier
        start={[rect.x - rect.w / 2 + 0.4, 0, rect.z + rect.d / 2 - 0.3]}
        end={[rect.x + rect.w / 2 - 0.4, 0, rect.z + rect.d / 2 - 0.3]}
      />
    </group>
  )
}

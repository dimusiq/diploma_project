import { useMemo } from "react"
import type { SimZone } from "@/components/deviceServer/simTypes.ts"
import { ChargingStation } from "@/components/warehouse3d/twin/ChargingStation.tsx"
import { DockModel } from "@/components/warehouse3d/twin/DockModel.tsx"
import {
  SafetyBarrier,
  SafetyBollard,
} from "@/components/warehouse3d/twin/SafetyBarrier.tsx"
import {
  DOCK_OPENING_HALF,
  TWIN_WALL_HEIGHT,
  TWIN_WALL_THICKNESS,
  wallSegments,
} from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
import { WarehouseFloor } from "@/components/warehouse3d/twin/WarehouseFloor.tsx"
import { WarehouseZone } from "@/components/warehouse3d/twin/WarehouseZone.tsx"
import {
  getFloorPlanDocks,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_DEPTH,
  WAREHOUSE_FACADE_X,
  WAREHOUSE_WIDTH,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

function TwinWalls({ darkMode }: { darkMode?: boolean }) {
  const hd = WAREHOUSE_DEPTH / 2
  const wallMat = darkMode ? TWIN_MAT.wallDark : TWIN_MAT.wall
  const docks = getFloorPlanDocks()
  const westGaps = useMemo(
    () =>
      docks
        .filter((d) => d.direction === "inbound")
        .map((d) => planToWorldZ(d.pos.z))
        .sort((a, b) => a - b),
    [docks],
  )
  const eastGaps = useMemo(
    () =>
      docks
        .filter((d) => d.direction === "outbound")
        .map((d) => planToWorldZ(d.pos.z))
        .sort((a, b) => a - b),
    [docks],
  )
  const westSegs = wallSegments(hd, westGaps, DOCK_OPENING_HALF)
  const eastSegs = wallSegments(hd, eastGaps, DOCK_OPENING_HALF)
  const h = TWIN_WALL_HEIGHT
  const t = TWIN_WALL_THICKNESS

  return (
    <group>
      <mesh
        geometry={TWIN_GEOM.box}
        material={wallMat}
        position={[0, h / 2, -hd]}
        scale={[WAREHOUSE_WIDTH, h, t]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={wallMat}
        position={[0, h / 2, hd]}
        scale={[WAREHOUSE_WIDTH, h, t]}
      />
      {westSegs.map((s, i) => (
        <mesh
          key={`w-${i}`}
          geometry={TWIN_GEOM.box}
          material={wallMat}
          position={[WAREHOUSE_FACADE_X.west, h / 2, s.center]}
          scale={[t, h, Math.max(0.2, s.length)]}
        />
      ))}
      {eastSegs.map((s, i) => (
        <mesh
          key={`e-${i}`}
          geometry={TWIN_GEOM.box}
          material={wallMat}
          position={[WAREHOUSE_FACADE_X.east, h / 2, s.center]}
          scale={[t, h, Math.max(0.2, s.length)]}
        />
      ))}
    </group>
  )
}

function EmergencyCabinets() {
  const spots: Array<[number, number, number]> = [
    [planToWorldX(24), 1.1, planToWorldZ(2.4)],
    [planToWorldX(80), 1.1, planToWorldZ(2.4)],
    [planToWorldX(24), 1.1, planToWorldZ(61.6)],
    [planToWorldX(80), 1.1, planToWorldZ(61.6)],
  ]
  return (
    <>
      {spots.map((pos) => (
        <mesh
          key={pos.join(",")}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.emergency}
          position={pos}
          scale={[0.45, 0.7, 0.22]}
        />
      ))}
    </>
  )
}

export function TwinInfrastructure({
  zones,
  darkMode,
}: {
  zones: SimZone[]
  darkMode?: boolean
}) {
  const docks = getFloorPlanDocks()
  const charging = zones.find((zone) => zone.kind === "charging")
  const hw = WAREHOUSE_WIDTH / 2
  const hd = WAREHOUSE_DEPTH / 2

  return (
    <group>
      <WarehouseFloor darkMode={darkMode} />
      <TwinWalls darkMode={darkMode} />
      {zones.map((zone) => (
        <WarehouseZone key={zone.id} zone={zone} darkMode={darkMode} />
      ))}
      {charging && <ChargingStation zone={charging} darkMode={darkMode} />}
      {docks.map((dock) => (
        <DockModel key={dock.id} dock={dock} darkMode={darkMode} />
      ))}
      <SafetyBarrier
        start={[-hw + 4, 0, -hd + 1.2]}
        end={[-hw + 18, 0, -hd + 1.2]}
      />
      <SafetyBarrier
        start={[hw - 18, 0, -hd + 1.2]}
        end={[hw - 4, 0, -hd + 1.2]}
      />
      <SafetyBollard position={[planToWorldX(22), 0, planToWorldZ(6)]} />
      <SafetyBollard position={[planToWorldX(22), 0, planToWorldZ(58)]} />
      <SafetyBollard position={[planToWorldX(78), 0, planToWorldZ(6)]} />
      <SafetyBollard position={[planToWorldX(78), 0, planToWorldZ(58)]} />
      <EmergencyCabinets />
    </group>
  )
}

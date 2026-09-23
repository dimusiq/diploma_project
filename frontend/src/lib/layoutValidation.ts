import {
  buildTopology,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
  workAisleGaps,
} from "@/components/deviceServer/simLayout.ts"
import {
  MAX_VEHICLE_WIDTH,
  REQUIRED_AISLE_WIDTH,
} from "@/components/warehouse3d/vehiclePhysicalDimensions.ts"
import type { SimDock, SimTopology } from "@/components/deviceServer/simTypes.ts"

export type LayoutIssue = {
  level: "warning" | "error"
  code: string
  message: string
}

const EXPECTED_DOCKS = ["IN-1", "IN-2", "IN-3", "OUT-1", "OUT-2", "OUT-3"]

function dockOutside(dock: SimDock): boolean {
  return (
    dock.yardPos.x < 0 ||
    dock.yardPos.x > WAREHOUSE_WIDTH ||
    dock.pos.x < 0 ||
    dock.pos.x > WAREHOUSE_WIDTH
  )
}

export function validateWarehouseLayout(
  topology: SimTopology = buildTopology(),
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const codes = new Set(topology.docks.map((dock) => dock.code))
  for (const code of EXPECTED_DOCKS) {
    if (!codes.has(code)) {
      issues.push({
        level: "error",
        code: "dock.missing",
        message: `Нет ворот ${code}`,
      })
    }
  }
  for (const dock of topology.docks) {
    if (dock.yardPos.x >= 0 && dock.yardPos.x <= WAREHOUSE_WIDTH) {
      issues.push({
        level: "error",
        code: "truck.inside",
        message: `Стоянка ${dock.code} внутри склада`,
      })
    }
    if (!dockOutside(dock) && dock.direction === "inbound" && dock.pos.x > 8) {
      issues.push({
        level: "warning",
        code: "dock.facade",
        message: `${dock.code} не у западного фасада`,
      })
    }
  }
  const byId = new Map(topology.racks.map((rack) => [rack.id, rack]))
  const seen = new Set<string>()
  for (const rack of topology.racks) {
    const mateId = rack.backToBackWith
    if (!mateId || seen.has(rack.id)) continue
    seen.add(rack.id)
    seen.add(mateId)
    const mate = byId.get(mateId)
    if (!mate) {
      issues.push({
        level: "error",
        code: "rack.pair",
        message: `${rack.code} без парного стеллажа`,
      })
      continue
    }
    const gap = Math.abs(rack.z - mate.z) - Math.min(rack.d, mate.d)
    if (gap > 1.2) {
      issues.push({
        level: "warning",
        code: "rack.aisle",
        message: `Между ${rack.code} и ${mate.code} есть проход (${gap.toFixed(1)} м)`,
      })
    }
  }
  if (topology.width !== WAREHOUSE_WIDTH || topology.depth !== WAREHOUSE_DEPTH) {
    issues.push({
      level: "warning",
      code: "warehouse.size",
      message: "Размер склада отличается от канонического плана",
    })
  }
  const gaps = workAisleGaps()
  const minAisle = gaps.reduce(
    (min, gap) => Math.min(min, gap.width),
    Number.POSITIVE_INFINITY,
  )
  if (gaps.length !== 9 || minAisle + 1e-6 < REQUIRED_AISLE_WIDTH) {
    issues.push({
      level: "error",
      code: "aisle.width",
      message: `Проезд ${minAisle.toFixed(2)} м уже требуемых ${REQUIRED_AISLE_WIDTH.toFixed(2)} м (техника ${MAX_VEHICLE_WIDTH.toFixed(2)} м)`,
    })
  }
  if (topology.racks.length !== 16) {
    issues.push({
      level: "error",
      code: "rack.count",
      message: `Стеллажей ${topology.racks.length}, ожидается 16`,
    })
  }
  const blockCount = topology.blocks?.length ?? seen.size / 2
  if (blockCount !== 8) {
    issues.push({
      level: "error",
      code: "rack.blocks",
      message: `Блоков ${blockCount}, ожидается 8`,
    })
  }
  if (topology.docks.length !== EXPECTED_DOCKS.length) {
    issues.push({
      level: "error",
      code: "dock.count",
      message: `Ворот ${topology.docks.length}, ожидается ${EXPECTED_DOCKS.length}`,
    })
  }
  const zoneCodes = new Set(topology.zones.map((zone) => zone.code))
  for (const code of ["RECV", "STOR", "PICK", "PACK", "SHIP", "CHRG"]) {
    if (!zoneCodes.has(code)) {
      issues.push({
        level: "error",
        code: "zone.missing",
        message: `Нет зоны ${code}`,
      })
    }
  }
  for (const dock of topology.docks) {
    const facesWarehouse =
      dock.direction === "inbound" ? dock.yardPos.x < 0 : dock.yardPos.x > WAREHOUSE_WIDTH
    if (!facesWarehouse) {
      issues.push({
        level: "warning",
        code: "truck.heading",
        message: `Кабина ${dock.code} не обращена к воротам`,
      })
    }
  }
  return issues
}

export function layoutSummary(topology: SimTopology = buildTopology()): string {
  const blocks =
    topology.blocks?.length ??
    topology.racks.filter((rack) => rack.backToBackWith).length / 2
  return `${blocks} блоков, ${topology.racks.length} стеллажей, ${topology.docks.length} ворот`
}

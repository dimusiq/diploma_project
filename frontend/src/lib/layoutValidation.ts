import {
  buildTopology,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
} from "@/components/deviceServer/simLayout.ts"
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
  return issues
}

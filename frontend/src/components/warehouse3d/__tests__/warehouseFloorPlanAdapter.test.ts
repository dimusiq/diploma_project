import { describe, expect, it } from "vitest"
import {
  FLOOR_PLAN_LAYOUT_SPEC,
  isFloorPlanLayoutSpec,
  normalizeSlotKey,
  planToWorldX,
  planToWorldZ,
  resolveFloorPlanLayoutSpec,
  simCellIdToSlotKey,
  slotKeyToSimCellId,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import { buildWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

describe("warehouseFloorPlanAdapter", () => {
  it("recognizes floor plan layout spec", () => {
    expect(isFloorPlanLayoutSpec(FLOOR_PLAN_LAYOUT_SPEC)).toBe(true)
    expect(
      isFloorPlanLayoutSpec({ rows: 12, levels: 4, cellX: 20, cellZ: 1 }),
    ).toBe(false)
  })

  it("resolves legacy API spec to floor plan dimensions", () => {
    expect(
      resolveFloorPlanLayoutSpec({
        rows: 12,
        levels: 4,
        cellX: 20,
        cellZ: 1,
      }),
    ).toEqual(FLOOR_PLAN_LAYOUT_SPEC)
  })

  it("maps sim cell id and API slot_key both ways", () => {
    expect(simCellIdToSlotKey("R01A-L1-C01")).toBe("0-0-0-0")
    expect(simCellIdToSlotKey("R08B-L3-C12")).toBe("15-2-11-0")
    expect(slotKeyToSimCellId("0-0-0-0")).toBe("R01A-L1-C01")
    expect(slotKeyToSimCellId("15-2-11-0")).toBe("R08B-L3-C12")
    expect(normalizeSlotKey("R02A-L2-C05")).toBe("2-1-4-0")
    expect(normalizeSlotKey("1-1-4-0")).toBe("1-1-4-0")
  })

  it("builds floor plan geometry with 16 back-to-back racks", () => {
    const geom = buildWarehouseGeometry(FLOOR_PLAN_LAYOUT_SPEC)
    expect(geom.floorPlanMode).toBe(true)
    expect(geom.rackRows).toBe(16)
    expect(geom.levels).toBe(3)
    expect(geom.cellsLength).toBe(12)
    expect(planToWorldX(52)).toBeCloseTo(0)
    expect(planToWorldZ(32)).toBeCloseTo(0)
    const [xA, yA, zA] = geom.getCellWorldPosition(0, 0, 0, 0)
    const [xB, , zB] = geom.getCellWorldPosition(1, 0, 0, 0)
    expect(xA).toBeCloseTo(xB, 5)
    expect(yA).toBeGreaterThan(0)
    expect(zB).toBeGreaterThan(zA)
  })
})

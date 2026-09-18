import { describe, expect, it } from "vitest"
import { occupiedCellKeysForTwin } from "@/components/deviceServer/twinOccupancy.ts"
import { FLOOR_PLAN_LAYOUT_SPEC } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import { buildWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"
import { buildOccupancyInstances, TWIN_PERF_BASELINE } from "../occupancyInstances.ts"

describe("instanced occupancy", () => {
  const geom = buildWarehouseGeometry(FLOOR_PLAN_LAYOUT_SPEC)

  it("creates a pallet lane for every occupied cell, without decorative extras", () => {
    const ids = [
      "R01A-L1-C01",
      "R01B-L1-C01",
      "R04A-L2-C03",
      "R08B-L3-C12",
    ]
    const keys = occupiedCellKeysForTwin(ids, [])
    const packed = buildOccupancyInstances(keys, geom)
    expect(packed.occupiedCount).toBe(4)
    expect(packed.palletCount).toBe(8)
    expect(packed.stringers.length).toBe(8 * 3)
    expect(packed.slats.length).toBe(8 * 5)
    const boxTotal =
      packed.boxes[0].length + packed.boxes[1].length + packed.boxes[2].length
    expect(boxTotal).toBeGreaterThanOrEqual(8 * 2)
    expect(boxTotal).toBeLessThanOrEqual(8 * 4)
    expect(packed.hitboxes.length).toBe(geom.rackRows * geom.levels * geom.cellsLength * geom.cellsDepth)
  })

  it("keeps occupancy count equal to inventory ids even at high fill", () => {
    const ids = Array.from({ length: 449 }, (_, i) => {
      const cell = i % 576
      const row = Math.floor(cell / 36)
      const rest = cell % 36
      const level = Math.floor(rest / 12)
      const bay = rest % 12
      const block = Math.floor(row / 2) + 1
      const side = row % 2 === 0 ? "A" : "B"
      return `R${String(block).padStart(2, "0")}${side}-L${level + 1}-C${String(bay + 1).padStart(2, "0")}`
    })
    const unique = new Set(ids)
    const keys = occupiedCellKeysForTwin([...unique], [])
    const packed = buildOccupancyInstances(keys, geom)
    expect(packed.occupiedCount).toBe(unique.size)
    expect(packed.palletCount).toBe(unique.size * 2)
  })

  it("records the legacy mesh cost so instancing stays cheaper", () => {
    expect(TWIN_PERF_BASELINE.occupancyMeshes).toBeGreaterThan(10_000)
    expect(TWIN_PERF_BASELINE.sseMotionHz).toBe(20)
  })
})

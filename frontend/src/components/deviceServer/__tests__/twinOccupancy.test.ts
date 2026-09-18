import { describe, expect, it } from "vitest"
import { simCellIdToSlotKey } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import {
  occupancyStatsForTwin,
  occupiedCellKeysForTwin,
} from "../twinOccupancy.ts"

describe("занятость ячеек для 3D", () => {
  it("переводит sim cell id в ключ сетки", () => {
    const keys = occupiedCellKeysForTwin(["R01A-L1-C01", "R08B-L3-C12"], [])
    expect(keys.has("0-0-0-0")).toBe(true)
    expect(keys.has("15-2-11-0")).toBe(true)
  })

  it("ставит паллету R04A-L2-C03 в rack A, уровень 2, секцию 3", () => {
    expect(simCellIdToSlotKey("R04A-L2-C03")).toBe("6-1-2-0")
    const keys = occupiedCellKeysForTwin(["R04A-L2-C03"], [])
    expect(keys.size).toBe(1)
    expect(keys.has("6-1-2-0")).toBe(true)
  })

  it("создаёт pallet instance на каждую occupied cell, без fake extras", () => {
    const ids = [
      "R01A-L1-C01",
      "R01B-L1-C01",
      "R04A-L2-C03",
      "R08B-L3-C12",
    ]
    const keys = occupiedCellKeysForTwin(ids, [
      { rackId: "rack-1-A", occupied: 36, total: 36 },
    ])
    expect(keys.size).toBe(ids.length)
    expect(ids.every((id) => simCellIdToSlotKey(id) && keys.has(simCellIdToSlotKey(id)!))).toBe(
      true,
    )
  })

  it("2D и 3D считают occupancy из одного snapshot", () => {
    const ids = Array.from({ length: 24 }, (_, i) => {
      const bay = String((i % 12) + 1).padStart(2, "0")
      const side = i < 12 ? "A" : "B"
      return `R02${side}-L1-C${bay}`
    })
    const rackFill = [{ rackId: "rack-2-A", occupied: 3, total: 36 }]
    const for3d = occupiedCellKeysForTwin(ids, rackFill)
    const for2d = occupiedCellKeysForTwin(ids, rackFill)
    expect(for2d).toEqual(for3d)
    const stats = occupancyStatsForTwin(576, ids.length, ids, rackFill)
    expect(stats.total).toBe(576)
    expect(stats.occupied).toBe(24)
    expect(stats.empty).toBe(552)
    expect(stats.percent).toBe(4.2)
    expect(stats.visualKeys).toBe(24)
  })
})

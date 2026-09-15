import { describe, expect, it } from "vitest"
import {
  buildBlocks,
  buildRacks,
  buildTopology,
  routeBetween,
} from "../simLayout.ts"
import { occupiedCellKeysForTwin } from "../twinOccupancy.ts"
import { getFloorPlanRacks } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

describe("маршрутизация по проездам", () => {
  it("строит путь между точками и заканчивает его в цели", () => {
    const path = routeBetween({ x: 6, z: 24 }, { x: 50, z: 41 })
    expect(path.length).toBeGreaterThan(1)
    const last = path[path.length - 1]
    expect(last).toEqual({ x: 50, z: 41 })
  })

  it("не возвращает пустой маршрут для совпадающих точек", () => {
    const path = routeBetween({ x: 10, z: 10 }, { x: 10, z: 10 })
    expect(path).toHaveLength(1)
  })
})

describe("геометрия склада Device Server", () => {
  it("имеет 8 back-to-back блоков = 16 стеллажей", () => {
    const racks = buildRacks()
    const blocks = buildBlocks(racks)
    expect(racks).toHaveLength(16)
    expect(blocks).toHaveLength(8)
    for (const block of blocks) {
      const rackA = racks.find((rack) => rack.id === block.rackAId)
      const rackB = racks.find((rack) => rack.id === block.rackBId)
      expect(rackA?.backToBackWith).toBe(rackB?.id)
      expect(rackB?.backToBackWith).toBe(rackA?.id)
      expect(rackA?.x).toBe(rackB?.x)
      expect(rackB!.z).toBeGreaterThan(rackA!.z + rackA!.d - 0.01)
      expect(rackB!.z - (rackA!.z + rackA!.d)).toBeLessThan(0.5)
    }
  })

  it("топология: рабочие проезды между блоками и два продольных коридора", () => {
    const topology = buildTopology()
    expect(topology.racks).toHaveLength(16)
    expect(topology.blocks).toHaveLength(8)
    expect(topology.aisleZ.length).toBeGreaterThanOrEqual(8)
    expect(topology.corridorX).toHaveLength(2)
  })

  it("2D и 3D берут один и тот же layout из simLayout", () => {
    expect(getFloorPlanRacks()).toEqual(buildRacks())
    expect(getFloorPlanRacks()).toHaveLength(16)
  })
})

describe("занятость ячеек для 3D", () => {
  it("переводит sim cell id в ключ сетки", () => {
    const keys = occupiedCellKeysForTwin(["R01A-L1-C01", "R08B-L3-C12"], [])
    expect(keys.has("0-0-0-0")).toBe(true)
    expect(keys.has("15-2-11-0")).toBe(true)
  })
})

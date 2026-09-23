import { describe, expect, it } from "vitest"
import {
  AISLE_WIDTH,
  buildDocks,
  buildTopology,
  workAisleGaps,
} from "@/components/deviceServer/simLayout.ts"
import { REQUIRED_AISLE_WIDTH } from "@/components/warehouse3d/vehiclePhysicalDimensions.ts"
import {
  dockWorldPose,
  truckWorldPose,
} from "@/components/warehouse3d/twin/twinLayout.ts"
import { layoutSummary, validateWarehouseLayout } from "@/lib/layoutValidation.ts"

describe("validateWarehouseLayout", () => {
  it("accepts the canonical back-to-back plan", () => {
    const topology = buildTopology()
    expect(validateWarehouseLayout(topology)).toEqual([])
    expect(layoutSummary(topology)).toBe("8 блоков, 16 стеллажей, 6 ворот")
    const gaps = workAisleGaps()
    expect(gaps.map((gap) => gap.id)).toEqual([
      "A01",
      "A02",
      "A03",
      "A04",
      "A05",
      "A06",
      "A07",
      "A08",
      "A09",
    ])
    for (const gap of gaps) {
      expect(gap.width).toBeGreaterThanOrEqual(REQUIRED_AISLE_WIDTH - 1e-6)
    }
    expect(AISLE_WIDTH).toBe(REQUIRED_AISLE_WIDTH)
    const minAisle = Math.min(...gaps.map((gap) => gap.width))
    expect(minAisle - REQUIRED_AISLE_WIDTH).toBeGreaterThanOrEqual(-1e-6)
  })

  it("keeps trucks outside the facade with the cabin turned outward", () => {
    for (const dock of buildDocks()) {
      const truck = truckWorldPose({
        x: dock.yardPos.x,
        z: dock.yardPos.z,
        direction: dock.direction,
      })
      const door = dockWorldPose(dock)
      expect(door.x).not.toBe(truck.x)
      if (dock.direction === "inbound") {
        expect(dock.yardPos.x).toBeLessThan(0)
        expect(truck.rotationY).toBe(-Math.PI / 2)
      } else {
        expect(dock.yardPos.x).toBeGreaterThan(104)
        expect(truck.rotationY).toBe(Math.PI / 2)
      }
    }
  })

  it("warns when a paired rack has an aisle between sides", () => {
    const topology = buildTopology()
    const rack = topology.racks[0]
    const mate = topology.racks.find((item) => item.id === rack.backToBackWith)
    expect(mate).toBeTruthy()
    if (!mate) return
    mate.z = rack.z + 8
    const issues = validateWarehouseLayout(topology)
    expect(issues.some((issue) => issue.code === "rack.aisle")).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { buildTopology } from "@/components/deviceServer/simLayout.ts"
import { validateWarehouseLayout } from "@/lib/layoutValidation.ts"

describe("validateWarehouseLayout", () => {
  it("accepts the canonical back-to-back plan", () => {
    expect(validateWarehouseLayout(buildTopology())).toEqual([])
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

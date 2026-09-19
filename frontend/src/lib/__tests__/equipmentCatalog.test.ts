import { describe, expect, it } from "vitest"
import { categoryOf } from "../equipmentCatalog.ts"
import { getSensorMetricLabel } from "../statusLabels.ts"

describe("equipmentCatalog", () => {
  it("maps existing device kinds to categories", () => {
    expect(categoryOf("agv")).toBe("transport")
    expect(categoryOf("forklift")).toBe("transport")
    expect(categoryOf("scanner")).toBe("scanner")
    expect(categoryOf("conveyor")).toBe("conveyor")
    expect(categoryOf("sensor")).toBe("sensor")
    expect(categoryOf("dock_door")).toBe("gate")
    expect(categoryOf("charger")).toBe("charging")
    expect(categoryOf("camera")).toBe("other")
  })
})

describe("sensor metric labels", () => {
  it("russifies known metric kinds", () => {
    expect(getSensorMetricLabel("temperature")).toBe("Температура")
    expect(getSensorMetricLabel("humidity")).toBe("Влажность")
  })
})

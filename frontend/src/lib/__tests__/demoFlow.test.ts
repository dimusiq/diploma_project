import { describe, expect, it } from "vitest"
import { demoStepFromEvents } from "@/lib/demoFlow.ts"

describe("demoStepFromEvents", () => {
  it("returns null until a known step appears", () => {
    expect(demoStepFromEvents([{ type: "SYSTEM_STARTED" }])).toBeNull()
  })

  it("advances to the latest flow step", () => {
    const step = demoStepFromEvents([
      { type: "TRUCK_ARRIVED" },
      { type: "ITEM_SCANNED" },
      { type: "ITEM_STORED" },
    ])
    expect(step?.title).toBe("Размещение")
    expect(step?.index).toBe(4)
    expect(step?.total).toBe(13)
  })
})

import { describe, expect, it } from "vitest"
import { matchesEventCategory } from "@/lib/simEventCategory.ts"

describe("matchesEventCategory", () => {
  it("keeps every event in all", () => {
    expect(
      matchesEventCategory({ type: "TASK_CREATED", severity: "info" }, "all"),
    ).toBe(true)
  })

  it("classifies errors and equipment", () => {
    expect(
      matchesEventCategory({ type: "DEVICE_ERROR", severity: "warning" }, "errors"),
    ).toBe(true)
    expect(
      matchesEventCategory({ type: "AGV_CHARGING", severity: "info" }, "equipment"),
    ).toBe(true)
    expect(
      matchesEventCategory({ type: "ORDER_CREATED", severity: "info" }, "equipment"),
    ).toBe(false)
  })

  it("splits orders, receiving, warehouse and simulation", () => {
    expect(
      matchesEventCategory({ type: "ITEM_SHIPPED", severity: "success" }, "orders"),
    ).toBe(true)
    expect(
      matchesEventCategory(
        { type: "RECEIVING_STARTED", severity: "info" },
        "receiving",
      ),
    ).toBe(true)
    expect(
      matchesEventCategory({ type: "ITEM_STORED", severity: "success" }, "warehouse"),
    ).toBe(true)
    expect(
      matchesEventCategory(
        { type: "SYSTEM_STARTED", severity: "info" },
        "simulation",
      ),
    ).toBe(true)
  })
})

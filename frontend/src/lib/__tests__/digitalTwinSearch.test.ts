import { describe, expect, it } from "vitest"
import { digitalTwinSearchSchema } from "@/lib/digitalTwinSearch.ts"

describe("digitalTwinSearchSchema", () => {
  it("falls back to overview 2d", () => {
    expect(digitalTwinSearchSchema.parse({})).toEqual({
      tab: "overview",
      view: "2d",
    })
  })

  it("accepts map 3d, deviceId and unknown values", () => {
    expect(
      digitalTwinSearchSchema.parse({ tab: "map", view: "3d", deviceId: "agv-1" }),
    ).toEqual({ tab: "map", view: "3d", deviceId: "agv-1" })
    expect(
      digitalTwinSearchSchema.parse({ tab: "nope", view: "iso" }),
    ).toEqual({ tab: "overview", view: "2d" })
  })
})

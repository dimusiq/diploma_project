import { describe, expect, it } from "vitest"
import { getFloorPlanDocks, ZONES } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import {
  chargingSlotPlanPositions,
  dockWorldPose,
  wallSegments,
  ZONE_LABELS,
} from "../twinLayout.ts"

describe("twin layout helpers", () => {
  it("maps all operational warehouse zones to English labels", () => {
    const kinds = ZONES.map((zone) => zone.kind)
    expect(kinds).toEqual(
      expect.arrayContaining([
        "receiving",
        "storage",
        "picking",
        "packing",
        "shipping",
        "charging",
      ]),
    )
    expect(ZONE_LABELS.receiving).toBe("RECEIVING")
    expect(ZONE_LABELS.charging).toBe("CHARGING")
  })

  it("places 6 loading docks from backend layout, inbound facing +X", () => {
    const docks = getFloorPlanDocks()
    expect(docks).toHaveLength(6)
    const inbound = docks.filter((d) => d.direction === "inbound")
    const outbound = docks.filter((d) => d.direction === "outbound")
    expect(inbound).toHaveLength(3)
    expect(outbound).toHaveLength(3)
    expect(dockWorldPose(inbound[0]!).rotationY).toBeCloseTo(Math.PI / 2)
    expect(dockWorldPose(outbound[0]!).rotationY).toBeCloseTo(-Math.PI / 2)
  })

  it("keeps charging slots inside the charging zone", () => {
    const zone = ZONES.find((item) => item.kind === "charging")
    expect(zone).toBeTruthy()
    const slots = chargingSlotPlanPositions(zone!, 4)
    expect(slots).toHaveLength(4)
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThanOrEqual(zone!.x)
      expect(slot.x).toBeLessThanOrEqual(zone!.x + zone!.w)
      expect(slot.z).toBeGreaterThanOrEqual(zone!.z)
      expect(slot.z).toBeLessThanOrEqual(zone!.z + zone!.d)
    }
  })

  it("cuts wall segments around dock openings", () => {
    const segs = wallSegments(32, [-10, 0, 10], 2.5)
    expect(segs.length).toBeGreaterThanOrEqual(2)
    expect(segs.every((s) => s.length > 0)).toBe(true)
  })
})

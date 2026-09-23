import { describe, expect, it } from "vitest"
import {
  getFloorPlanDocks,
  planToWorldX,
  WAREHOUSE_FACADE_X,
  WAREHOUSE_WIDTH,
  ZONES,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import {
  chargingSlotPlanPositions,
  DOCK_DOOR_WIDTH,
  DOCK_FRAME_WIDTH,
  DOCK_GATE_HEIGHT,
  DOCK_GATE_TOP,
  DOCK_HEADER_H,
  DOCK_INNER_FACE_Z,
  DOCK_OPENING_HALF,
  dockBollardLocals,
  dockHazardLocal,
  dockLocalToWorld,
  dockPointInsideWarehouse,
  dockWorldPose,
  TWIN_WALL_HEIGHT,
  truckWorldPose,
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

  it("snaps 3D dock doors to the facade, not to logical dock.pos", () => {
    const docks = getFloorPlanDocks()
    for (const dock of docks) {
      const pose = dockWorldPose(dock)
      const facade =
        dock.direction === "inbound"
          ? WAREHOUSE_FACADE_X.west
          : WAREHOUSE_FACADE_X.east
      expect(pose.x).toBeCloseTo(facade)
      expect(pose.x).toBeCloseTo(
        dock.direction === "inbound"
          ? -WAREHOUSE_WIDTH / 2
          : WAREHOUSE_WIDTH / 2,
      )
      expect(planToWorldX(dock.pos.x)).not.toBeCloseTo(facade)
    }
  })

  it("sizes the wall opening around the door frame", () => {
    expect(DOCK_OPENING_HALF * 2).toBeGreaterThan(DOCK_DOOR_WIDTH)
    expect(DOCK_FRAME_WIDTH).toBeGreaterThan(DOCK_DOOR_WIDTH)
    expect(DOCK_FRAME_WIDTH).toBeGreaterThan(DOCK_OPENING_HALF * 2)
    expect(DOCK_FRAME_WIDTH - DOCK_OPENING_HALF * 2).toBeLessThan(0.2)
  })

  it("keeps yard trucks outside and trailer-facing the facade", () => {
    const inbound = truckWorldPose({ x: -12, z: 10, direction: "inbound" })
    const outbound = truckWorldPose({ x: 116, z: 34, direction: "outbound" })
    expect(inbound.x).toBeLessThan(WAREHOUSE_FACADE_X.west)
    expect(outbound.x).toBeGreaterThan(WAREHOUSE_FACADE_X.east)
    expect(inbound.rotationY).toBeCloseTo(-Math.PI / 2)
    expect(outbound.rotationY).toBeCloseTo(Math.PI / 2)
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

  it("aligns the closed gate with the facade lintel", () => {
    expect(DOCK_GATE_TOP).toBeCloseTo(TWIN_WALL_HEIGHT - DOCK_HEADER_H)
    expect(DOCK_GATE_HEIGHT).toBeCloseTo(DOCK_GATE_TOP)
    expect(DOCK_HEADER_H).toBeLessThan(TWIN_WALL_HEIGHT * 0.2)
    expect(DOCK_GATE_HEIGHT).toBeGreaterThan(3)
  })

  it("keeps bollards and hazard paint inside the warehouse, clear of the opening", () => {
    const docks = getFloorPlanDocks()
    const hazard = dockHazardLocal()
    const near = hazard.centerZ - hazard.depth / 2
    const far = hazard.centerZ + hazard.depth / 2
    expect(near).toBeGreaterThan(DOCK_INNER_FACE_Z)
    expect(hazard.centerZ).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
    for (const bollard of dockBollardLocals()) {
      expect(Math.abs(bollard[0])).toBeGreaterThan(DOCK_OPENING_HALF)
      expect(bollard[2]).toBeGreaterThan(DOCK_INNER_FACE_Z)
      expect(bollard[2]).toBeLessThan(near)
    }
    for (const dock of docks) {
      expect(dockWorldPose(dock).x).toBeCloseTo(
        dock.direction === "inbound"
          ? WAREHOUSE_FACADE_X.west
          : WAREHOUSE_FACADE_X.east,
      )
      for (const bollard of dockBollardLocals()) {
        expect(
          dockPointInsideWarehouse(dock, { x: bollard[0], z: bollard[2] }),
        ).toBe(true)
      }
      for (const z of [near, far]) {
        expect(dockPointInsideWarehouse(dock, { x: 0, z })).toBe(true)
        const world = dockLocalToWorld(dock, { x: 0, z })
        if (dock.direction === "inbound") {
          expect(world.x).toBeGreaterThan(WAREHOUSE_FACADE_X.west)
        } else {
          expect(world.x).toBeLessThan(WAREHOUSE_FACADE_X.east)
        }
      }
    }
  })

  it("leaves a centered opening at each dock z on the facade span", () => {
    const docks = getFloorPlanDocks()
    const inboundZ = docks
      .filter((d) => d.direction === "inbound")
      .map((d) => dockWorldPose(d).z)
    const segs = wallSegments(32, inboundZ, DOCK_OPENING_HALF)
    for (const z of inboundZ) {
      expect(segs.some((s) => Math.abs(s.center - z) < 0.5)).toBe(false)
    }
  })
})

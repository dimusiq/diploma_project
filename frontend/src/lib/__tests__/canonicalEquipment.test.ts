import { describe, expect, it } from "vitest"
import type { FleetDevice } from "@/api/simFleet.ts"
import { SIM_FLEET_QUERY_KEY } from "@/api/simFleet.ts"
import {
  deviceEngineHours,
  EQUIPMENT_QUERY_KEY,
  toCanonicalEquipment,
} from "../canonicalEquipment.ts"

const device: FleetDevice = {
  id: "id-agv-1",
  code: "agv-1",
  name: "AGV-01",
  description: null,
  category: "transport",
  kind: "agv",
  device_type: "AGV",
  enabled: true,
  archived: false,
  inMaintenance: false,
  engine_hours: 120,
  configuration: {
    speed: 1.5,
    battery: 80,
    home: { x: 0, z: 0 },
    zoneId: "zone-stor",
  },
  runtime: {
    status: "idle",
    online: true,
    battery: 80,
    position: null,
    taskId: null,
    busySec: 7200,
    inSimulation: false,
  },
  created_at: null,
  updated_at: null,
}

describe("canonicalEquipment", () => {
  it("shares the fleet query key with /equipment", () => {
    expect(EQUIPMENT_QUERY_KEY).toEqual(["equipment"])
    expect(EQUIPMENT_QUERY_KEY).toBe(SIM_FLEET_QUERY_KEY)
  })

  it("maps fleet device name, code, zone and status", () => {
    const row = toCanonicalEquipment(device, [
      { id: "zone-stor", name: "Хранение", kind: "storage" },
    ])
    expect(row.id).toBe("id-agv-1")
    expect(row.name).toBe("AGV-01")
    expect(row.code).toBe("agv-1")
    expect(row.kind).toBe("agv")
    expect(row.zone).toBe("Хранение")
    expect(row.engineHours).toBe(120)
    expect(row.inMaintenance).toBe(false)
    expect(row.currentStatus).toBe("idle")
  })

  it("prefers engine_hours over busySec and uses maintenance status", () => {
    expect(deviceEngineHours({ ...device, engine_hours: null })).toBe(2)
    const row = toCanonicalEquipment({
      ...device,
      inMaintenance: true,
      engine_hours: null,
    })
    expect(row.inMaintenance).toBe(true)
    expect(row.currentStatus).toBe("maintenance")
    expect(row.engineHours).toBe(2)
  })
})

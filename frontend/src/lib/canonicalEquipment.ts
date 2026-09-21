/** Canonical equipment is the Device Server fleet (`wsim_device`). */

import {
  type EquipmentZoneMeta,
  type FleetDevice,
  fetchSimFleet,
  SIM_FLEET_QUERY_KEY,
} from "@/api/simFleet.ts"
import { deviceKindLabel } from "@/components/deviceServer/simFormat.ts"
import type { DeviceKind } from "@/components/deviceServer/simTypes.ts"

export const EQUIPMENT_QUERY_KEY = SIM_FLEET_QUERY_KEY

export type CanonicalEquipment = {
  id: string
  name: string
  code: string
  kind: string
  kindLabel: string
  zoneId: string | null
  zone: string | null
  engineHours: number | null
  inMaintenance: boolean
  currentStatus: string
}

export function deviceEngineHours(device: FleetDevice): number | null {
  if (device.engine_hours != null) return device.engine_hours
  const busy = device.runtime.busySec
  if (busy != null && busy > 0) return Math.floor(busy / 3600)
  return null
}

export function toCanonicalEquipment(
  device: FleetDevice,
  zones: EquipmentZoneMeta[] = [],
): CanonicalEquipment {
  const zoneId = device.configuration.zoneId ?? null
  const zone =
    zones.find((item) => item.id === zoneId)?.name ?? zoneId
  const inMaintenance = Boolean(device.inMaintenance)
  return {
    id: device.id,
    name: device.name,
    code: device.code,
    kind: String(device.kind),
    kindLabel: deviceKindLabel(device.kind as DeviceKind) || String(device.kind),
    zoneId,
    zone,
    engineHours: deviceEngineHours(device),
    inMaintenance,
    currentStatus: inMaintenance
      ? "maintenance"
      : device.runtime.status || (device.enabled ? "active" : "offline"),
  }
}

export function loadCanonicalEquipment() {
  return fetchSimFleet(false)
}

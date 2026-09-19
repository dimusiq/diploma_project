/**
 * Persistent Device Server fleet (wsim_device). Runtime overlay is read-only.
 */

import { request } from "@/lib/apiClient.ts"

const BASE = "/api/v1/warehouse-sim/fleet"

export const FLEET_KINDS = [
  "agv",
  "amr",
  "forklift",
  "scanner",
  "sensor",
  "conveyor",
  "dock_door",
  "charger",
] as const

export type FleetKind = (typeof FLEET_KINDS)[number]

export type FleetRuntime = {
  status: string | null
  online: boolean | null
  battery: number | null
  position: { x: number; z: number } | null
  taskId: string | null
  metric?: number | null
  metricKind?: string | null
  metricUnit?: string | null
  lastSeen?: number | null
  inSimulation: boolean
}

export type FleetDevice = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  kind: FleetKind | string
  device_type: string
  enabled: boolean
  archived: boolean
  simulated?: boolean
  configuration: {
    speed: number
    battery: number | null
    home: { x: number; z: number }
    zoneId?: string | null
    metricKind?: string | null
    metricUnit?: string | null
    metricMin?: number | null
    metricMax?: number | null
    metric?: number | null
  }
  runtime: FleetRuntime
  created_at: string | null
  updated_at: string | null
}

export type EquipmentCategoryMeta = {
  id: string
  label: string
  columns: string[]
}

export type EquipmentTypeMeta = {
  kind: string
  category: string
  label: string
  fields: string[]
  simulated: boolean
  taskCapable: boolean
}

export type EquipmentZoneMeta = {
  id: string
  name: string
  kind: string
}

export type FleetListResponse = {
  data: FleetDevice[]
  count: number
  kinds: string[]
  categories: EquipmentCategoryMeta[]
  types: EquipmentTypeMeta[]
  zones: EquipmentZoneMeta[]
  sensorMetrics: { id: string; label: string }[]
}

export type FleetCreate = {
  kind: string
  name?: string
  code?: string
  description?: string | null
  enabled?: boolean
  speed?: number
  battery?: number
  configuration?: Record<string, unknown>
}

export type FleetPatch = {
  name?: string
  code?: string
  description?: string | null
  kind?: string
  enabled?: boolean
  archived?: boolean
  speed?: number
  configuration?: Record<string, unknown>
}

export async function fetchSimFleet(includeArchived = false): Promise<FleetListResponse> {
  const q = includeArchived ? "?include_archived=true" : ""
  return request(`${BASE}${q}`)
}

export async function createSimFleetDevice(
  body: FleetCreate,
): Promise<FleetDevice> {
  return request(BASE, { method: "POST", body })
}

export async function patchSimFleetDevice(
  id: string,
  body: FleetPatch,
): Promise<FleetDevice> {
  return request(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  })
}

export async function archiveSimFleetDevice(id: string): Promise<FleetDevice> {
  return request(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" })
}

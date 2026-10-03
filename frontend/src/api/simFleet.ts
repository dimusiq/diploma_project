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
  "radio_beacon",
  "smart_camera",
] as const

export type FleetKind = (typeof FLEET_KINDS)[number]

export type FleetAssignedEmployee = {
  id: string
  employee_code: string
  full_name: string
}

export type FleetSmartCamera = {
  device_id: string
  code: string
  name: string
  status: string
  online?: boolean
  fps?: number
  detection_count?: number
  last_signal_at?: string | null
  model?: string | null
  resolution?: string | null
  assigned_at?: string | null
  host?: { id: string; code: string; name: string } | null
  runtime?: import("@/components/deviceServer/simTypes.ts").SimCameraState | null
}

export type FleetMountedOn = {
  id: string
  code: string
  name: string
  kind: string
}

export type AvailableSmartCamera = {
  device_id: string
  code: string
  name: string
  status: string
  model?: string | null
  resolution?: string | null
  fps?: number | null
  last_signal_at?: string | null
}

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
  lastEventAt?: number | null
  busySec?: number | null
  inSimulation: boolean
  inMaintenance?: boolean
  locationSource?: string | null
  locationStale?: boolean
  lastSignalAt?: string | null
  currentZone?: string | null
}

export type MaintenanceTone = "ok" | "due_soon" | "overdue" | "in_progress"

export type FleetMaintenanceSummary = {
  count: number
  overdueCount: number
  lastAt: string | null
  nextAt: string | null
  status: string | null
  tone: MaintenanceTone
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
  inMaintenance?: boolean
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
    inMaintenance?: boolean
    camera?: import("@/components/deviceServer/simTypes.ts").SimCameraState | null
    serialNumber?: string | null
  }
  runtime: FleetRuntime & {
    camera?: import("@/components/deviceServer/simTypes.ts").SimCameraState | null
  }
  maintenance?: FleetMaintenanceSummary | null
  engine_hours?: number | null
  deferredUntilRestart?: string[]
  created_at: string | null
  updated_at: string | null
  serial_number?: string | null
  last_signal_at?: string | null
  location_source?: string | null
  location_stale?: boolean
  assigned_employee?: FleetAssignedEmployee | null
  smart_camera?: FleetSmartCamera | null
  mounted_on?: FleetMountedOn | null
}

export type DeviceMaintenanceRecord = {
  id: string
  device_id: string
  type: string
  status: string
  title: string
  description: string | null
  priority: string
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  performed_by: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type DeviceMaintenanceList = {
  data: DeviceMaintenanceRecord[]
  count: number
  summary: FleetMaintenanceSummary
}

export type DeviceMaintenanceCreate = {
  type: string
  status?: string
  title: string
  description?: string
  priority?: string
  scheduled_at?: string
  performed_by?: string
  notes?: string
}

export type SimTask = {
  id: string
  kind: string
  status: string
  deviceId: string | null
  createdAt?: number
  assignedAt?: number | null
  doneAt?: number | null
}

export type SimEventItem = {
  id: number
  at?: number
  type: string
  severity?: string
  message: string
  deviceId?: string | null
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
  inMaintenance?: boolean
  engineHours?: number
}

export const SIM_FLEET_QUERY_KEY = ["equipment"] as const

export async function fetchSimFleet(includeArchived = false): Promise<FleetListResponse> {
  const q = includeArchived ? "?include_archived=true" : ""
  return request(`${BASE}${q}`)
}

export async function fetchSimFleetDevice(id: string): Promise<FleetDevice> {
  return request(`${BASE}/${encodeURIComponent(id)}`)
}

export async function fetchDeviceTasks(id: string): Promise<{ data: SimTask[]; count: number }> {
  return request(`${BASE}/${encodeURIComponent(id)}/tasks`)
}

export async function fetchDeviceEvents(
  id: string,
): Promise<{ data: SimEventItem[]; count: number }> {
  return request(`${BASE}/${encodeURIComponent(id)}/events?limit=80`)
}

export async function fetchDeviceMaintenance(id: string): Promise<DeviceMaintenanceList> {
  return request(`${BASE}/${encodeURIComponent(id)}/maintenance`)
}

export async function createDeviceMaintenance(
  id: string,
  body: DeviceMaintenanceCreate,
): Promise<DeviceMaintenanceRecord> {
  return request(`${BASE}/${encodeURIComponent(id)}/maintenance`, {
    method: "POST",
    body,
  })
}

export async function patchDeviceMaintenance(
  deviceId: string,
  recordId: string,
  body: Partial<DeviceMaintenanceCreate> & { status?: string },
): Promise<DeviceMaintenanceRecord> {
  return request(
    `${BASE}/${encodeURIComponent(deviceId)}/maintenance/${encodeURIComponent(recordId)}`,
    { method: "PATCH", body },
  )
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

export async function fetchAvailableSmartCameras(): Promise<{
  data: AvailableSmartCamera[]
  count: number
}> {
  return request(`${BASE}/smart-cameras/available`)
}

export async function fetchDeviceSmartCamera(
  id: string,
): Promise<{ smart_camera: FleetSmartCamera | null; mounted_on?: FleetMountedOn | null }> {
  return request(`${BASE}/${encodeURIComponent(id)}/smart-camera`)
}

export async function assignDeviceSmartCamera(
  id: string,
  cameraId: string,
): Promise<{ smart_camera: FleetSmartCamera | null }> {
  return request(`${BASE}/${encodeURIComponent(id)}/smart-camera/assign`, {
    method: "POST",
    body: { camera_id: cameraId },
  })
}

export async function replaceDeviceSmartCamera(
  id: string,
  cameraId: string,
): Promise<{ smart_camera: FleetSmartCamera | null }> {
  return request(`${BASE}/${encodeURIComponent(id)}/smart-camera/replace`, {
    method: "POST",
    body: { camera_id: cameraId },
  })
}

export async function unassignDeviceSmartCamera(
  id: string,
): Promise<{ smart_camera: FleetSmartCamera | null }> {
  return request(`${BASE}/${encodeURIComponent(id)}/smart-camera/unassign`, {
    method: "POST",
  })
}

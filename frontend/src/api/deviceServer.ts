/**
 * HTTP-клиент Warehouse Device Server.
 * Чтение snapshot/stream — для авторизованных пользователей (Digital Twin).
 * Команды runtime — только admin (Device Monitor).
 */

import type { SimCommand, SimConfig } from "@/components/deviceServer/simTypes.ts"
import { request } from "@/lib/apiClient.ts"

const BASE = "/api/v1/warehouse-sim"

export async function fetchSimSnapshot<T = Record<string, unknown>>(): Promise<T> {
  return request<T>(`${BASE}/snapshot`)
}

export async function fetchSimMotion<T = Record<string, unknown>>(): Promise<T> {
  return request<T>(`${BASE}/motion`)
}

export async function postSimControl<T = Record<string, unknown>>(
  action: "start" | "pause" | "stop" | "reset",
  config?: Partial<SimConfig>,
): Promise<T> {
  return request<T>(`${BASE}/control`, {
    method: "POST",
    body: { action, config },
  })
}

export async function postSimSpeed<T = Record<string, unknown>>(
  speed: number,
): Promise<T> {
  return request<T>(`${BASE}/speed`, {
    method: "POST",
    body: { speed },
  })
}

export async function patchSimConfig<T = Record<string, unknown>>(
  patch: Partial<SimConfig>,
): Promise<T> {
  return request<T>(`${BASE}/config`, {
    method: "PATCH",
    body: patch,
  })
}

export async function postSimCommand<T = Record<string, unknown>>(
  command: SimCommand,
): Promise<T> {
  return request<T>(`${BASE}/command`, {
    method: "POST",
    body: command,
  })
}

export async function postDeviceCommand(
  deviceId: string,
  command: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  return request(`${BASE}/devices/${encodeURIComponent(deviceId)}/command`, {
    method: "POST",
    body: { command, payload },
  })
}

export async function postSimEvent<T = Record<string, unknown>>(
  event_type: string,
  device_id?: string,
  message?: string,
): Promise<T> {
  return request<T>(`${BASE}/events`, {
    method: "POST",
    body: { event_type, device_id, message },
  })
}

export async function postFastForward<T = Record<string, unknown>>(
  seconds: number,
): Promise<T> {
  return request<T>(`${BASE}/fast-forward`, {
    method: "POST",
    body: { seconds },
  })
}

export async function postApplyScenario<T = Record<string, unknown>>(
  code: string,
): Promise<T> {
  return request<T>(`${BASE}/scenarios/apply`, {
    method: "POST",
    body: { code },
  })
}

export async function postDemoStart<T = Record<string, unknown>>(): Promise<T> {
  return request<T>(`${BASE}/demo/start`, { method: "POST" })
}

export async function postDemoReset<T = Record<string, unknown>>(): Promise<T> {
  return request<T>(`${BASE}/demo/reset`, { method: "POST" })
}

export type SimEventLogItem = {
  id: number
  at: number
  type: string
  severity: string
  message: string
  deviceId?: string | null
  entityId?: string | null
  zoneId?: string | null
  taskId?: string | null
  orderId?: string | null
  wmsOrderId?: string | null
}

export type SimEventLog = {
  data: SimEventLogItem[]
  count: number
}

export async function fetchSimEvents(params?: {
  skip?: number
  limit?: number
  q?: string
  device_id?: string
  severity?: string
  event_type?: string
}): Promise<SimEventLog> {
  const query = new URLSearchParams()
  if (params?.skip != null) query.set("skip", String(params.skip))
  if (params?.limit != null) query.set("limit", String(params.limit))
  if (params?.q) query.set("q", params.q)
  if (params?.device_id) query.set("device_id", params.device_id)
  if (params?.severity) query.set("severity", params.severity)
  if (params?.event_type) query.set("event_type", params.event_type)
  const suffix = query.toString()
  return request<SimEventLog>(`${BASE}/events${suffix ? `?${suffix}` : ""}`)
}

export type SimScenarioDef = {
  code: string
  name: string
  description: string
}

export async function fetchSimScenarios(): Promise<SimScenarioDef[]> {
  const res = await request<{ data: SimScenarioDef[] }>(`${BASE}/scenarios`)
  return res.data
}

export function simStreamUrl(): string {
  return `${BASE}/stream`
}

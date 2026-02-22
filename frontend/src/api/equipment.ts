/**
 * API для раздела «Список техники» (Equipment).
 */

import { OpenAPI } from "@/client/index.ts"

const getBase = () => OpenAPI.BASE || "http://localhost:8000"
const getToken = () => localStorage.getItem("access_token") || ""

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await getToken()
  const url = `${getBase()}${path}`
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(
      err.detail || Array.isArray(err.detail)
        ? err.detail.map((e: { msg: string }) => e.msg).join(", ")
        : String(err),
    )
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

/** Типы складской техники */
export const EQUIPMENT_TYPE_IDS = [
  "autopogruzchik",
  "elektropogruzchik",
  "komplektovshchik",
  "richtrak",
  "elektrotelezhka",
] as const
export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  autopogruzchik: "Автопогрузчик",
  elektropogruzchik: "Электропогрузчик",
  komplektovshchik: "Комплектовщик",
  richtrak: "Ричтрак",
  elektrotelezhka: "Электротележка",
}

export interface EquipmentPublic {
  id: string
  equipment_type: string
  vin: string | null
  serial_number: string | null
  garage_number: string | null
  brand_id: string
  brand_name: string
  model: string
  commissioned_at: string | null
  engine_hours: number | null
  current_status: string
  zone: string | null
  attachments: string | null
  instructions: string | null
  created_at: string
}

export interface EquipmentCreate {
  equipment_type: string
  vin?: string | null
  serial_number?: string | null
  garage_number?: string | null
  brand_id: string
  model: string
  commissioned_at?: string | null
  engine_hours?: number | null
  current_status?: string
  zone?: string | null
  attachments?: string | null
  instructions?: string | null
}

export interface EquipmentUpdate {
  equipment_type?: string
  vin?: string | null
  serial_number?: string | null
  garage_number?: string | null
  brand_id?: string
  model?: string
  commissioned_at?: string | null
  engine_hours?: number | null
  current_status?: string
  zone?: string | null
  attachments?: string | null
  instructions?: string | null
}

export interface EquipmentListResponse {
  data: EquipmentPublic[]
  count: number
}

export interface MaintenanceRecordPublic {
  id: string
  equipment_id: string
  performed_at: string
  engine_hours_at_service: number | null
  interval_hours: number
  comment: string | null
}

export interface MaintenanceRecordCreate {
  performed_at: string // YYYY-MM-DD
  engine_hours_at_service?: number | null
  interval_hours: number
  comment?: string | null
}

export interface MaintenanceRecordListResponse {
  data: MaintenanceRecordPublic[]
  count: number
}

export interface MaintenanceRecordWithEquipmentPublic {
  id: string
  equipment_id: string
  equipment_name: string
  performed_at: string
  engine_hours_at_service: number | null
  interval_hours: number
  comment: string | null
}

export interface MaintenanceRecordListWithEquipmentResponse {
  data: MaintenanceRecordWithEquipmentPublic[]
  count: number
}

export const equipmentApi = {
  list: (params?: {
    skip?: number
    limit?: number
    search?: string
    current_status?: string
    equipment_type?: string
    brand_id?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.skip != null) q.set("skip", String(params.skip))
    if (params?.limit != null) q.set("limit", String(params.limit))
    if (params?.search) q.set("search", params.search)
    if (params?.current_status) q.set("current_status", params.current_status)
    if (params?.equipment_type) q.set("equipment_type", params.equipment_type)
    if (params?.brand_id) q.set("brand_id", params.brand_id)
    const query = q.toString()
    return request<EquipmentListResponse>(
      `/api/v1/equipment/${query ? `?${query}` : ""}`,
    )
  },
  get: (id: string) => request<EquipmentPublic>(`/api/v1/equipment/${id}`),
  maintenanceRecords: (equipmentId: string) =>
    request<MaintenanceRecordListResponse>(
      `/api/v1/equipment/${equipmentId}/maintenance-records`,
    ),
  createMaintenanceRecord: (
    equipmentId: string,
    body: MaintenanceRecordCreate,
  ) =>
    request<MaintenanceRecordPublic>(
      `/api/v1/equipment/${equipmentId}/maintenance-records`,
      {
        method: "POST",
        body,
      },
    ),
  allMaintenanceRecords: (params?: {
    skip?: number
    limit?: number
    equipment_id?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.skip != null) q.set("skip", String(params.skip))
    if (params?.limit != null) q.set("limit", String(params.limit))
    if (params?.equipment_id) q.set("equipment_id", params.equipment_id)
    const query = q.toString()
    return request<MaintenanceRecordListWithEquipmentResponse>(
      `/api/v1/equipment/maintenance-records${query ? `?${query}` : ""}`,
    )
  },
  create: (body: EquipmentCreate) =>
    request<EquipmentPublic>("/api/v1/equipment/", { method: "POST", body }),
  update: (id: string, body: EquipmentUpdate) =>
    request<EquipmentPublic>(`/api/v1/equipment/${id}`, {
      method: "PUT",
      body,
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/equipment/${id}`, {
      method: "DELETE",
    }),
}

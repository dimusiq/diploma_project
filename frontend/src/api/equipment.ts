/**
 * API для раздела «Список техники» (Equipment).
 */

import { request } from "@/lib/apiClient.ts"

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

export type EquipmentSortField =
  | "brand_model"
  | "serial_number"
  | "garage_number"
  | "equipment_type"
  | "zone"
  | "engine_hours"
  | "commissioned_at"
  | "current_status"
export type EquipmentSortOrder = "asc" | "desc"

export const equipmentApi = {
  list: (params?: {
    skip?: number
    limit?: number
    search?: string
    current_status?: string
    equipment_type?: string
    brand_id?: string
    sort_by?: EquipmentSortField
    order?: EquipmentSortOrder
  }) => {
    const q = new URLSearchParams()
    if (params?.skip != null) q.set("skip", String(params.skip))
    if (params?.limit != null) q.set("limit", String(params.limit))
    if (params?.search) q.set("search", params.search)
    if (params?.current_status) q.set("current_status", params.current_status)
    if (params?.equipment_type) q.set("equipment_type", params.equipment_type)
    if (params?.brand_id) q.set("brand_id", params.brand_id)
    if (params?.sort_by) q.set("sort_by", params.sort_by)
    if (params?.order) q.set("order", params.order)
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
  /** Смена только current_status одной единицы (PATCH, без затрагивания прочих полей). */
  patchCurrentStatus: (id: string, current_status: string) =>
    request<EquipmentPublic>(`/api/v1/equipment/${id}/current-status`, {
      method: "PATCH",
      body: { current_status },
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/equipment/${id}`, {
      method: "DELETE",
    }),
}

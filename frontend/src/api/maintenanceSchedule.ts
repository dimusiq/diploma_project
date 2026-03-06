/**
 * API расписания ТО (цепочки, конфиг, права, импорт из localStorage).
 */

import { request } from "@/lib/apiClient.ts"

export interface MaintenanceChainPublic {
  id: string
  name: string
  color_tag: string
  remind_before_hours: number
  interval_hours: number[]
  equipment_ids: string[]
  created_at: string
  updated_at: string
}

export interface MaintenanceChainListResponse {
  data: MaintenanceChainPublic[]
  count: number
}

export interface MaintenanceScheduleConfigPublic {
  default_intervals: number[]
  default_remind_before_hours: number
}

export interface MaintenanceChainCreateBody {
  name: string
  color_tag?: string
  remind_before_hours?: number
  interval_hours: number[]
  equipment_ids?: string[]
}

export interface MaintenanceChainUpdateBody {
  name?: string
  color_tag?: string
  remind_before_hours?: number
  interval_hours?: number[]
  equipment_ids?: string[]
}

export interface MaintenanceChainAuditPublic {
  id: string
  chain_id: string | null
  user_id: string | null
  user_email: string | null
  action: string
  old_intervals: string | null
  new_intervals: string | null
  details: string | null
  created_at: string
}

export interface MaintenanceSchedulePermissions {
  can_view: boolean
  can_edit: boolean
}

/** Формат цепочки как в localStorage (для импорта). */
export interface LocalChainFormat {
  id?: string
  name: string
  intervalHours?: number[]
  colorTag?: string
  remindBeforeHours?: number
  equipmentIds?: string[]
}

const BASE = "/api/v1/maintenance-schedule"

export const maintenanceScheduleApi = {
  getPermissions: () =>
    request<MaintenanceSchedulePermissions>(`${BASE}/permissions`),

  listChains: () =>
    request<MaintenanceChainListResponse>(`${BASE}/chains`),

  getChain: (chainId: string) =>
    request<MaintenanceChainPublic>(`${BASE}/chains/${chainId}`),

  createChain: (body: MaintenanceChainCreateBody) =>
    request<MaintenanceChainPublic>(`${BASE}/chains`, {
      method: "POST",
      body,
    }),

  updateChain: (chainId: string, body: MaintenanceChainUpdateBody) =>
    request<MaintenanceChainPublic>(`${BASE}/chains/${chainId}`, {
      method: "PUT",
      body,
    }),

  deleteChain: (chainId: string) =>
    request<{ message: string }>(`${BASE}/chains/${chainId}`, {
      method: "DELETE",
    }),

  getChainHistory: (chainId: string) =>
    request<{ data: MaintenanceChainAuditPublic[]; count: number }>(
      `${BASE}/chains/${chainId}/history`,
    ),

  getConfig: () =>
    request<MaintenanceScheduleConfigPublic>(`${BASE}/config`),

  updateConfig: (body: MaintenanceScheduleConfigPublic) =>
    request<MaintenanceScheduleConfigPublic>(`${BASE}/config`, {
      method: "PUT",
      body,
    }),

  importFromLocal: (chains: LocalChainFormat[]) =>
    request<{ imported: number; message: string }>(`${BASE}/chains/import-from-local`, {
      method: "POST",
      body: { chains },
    }),
}

/** Преобразование ответа API в формат, совместимый с MaintenanceChain (id, name, intervalHours, colorTag, remindBeforeHours, equipmentIds). */
export function apiChainToLegacyFormat(c: MaintenanceChainPublic): {
  id: string
  name: string
  intervalHours: number[]
  colorTag: string
  remindBeforeHours: number
  equipmentIds: string[]
} {
  return {
    id: c.id,
    name: c.name,
    intervalHours: c.interval_hours ?? [],
    colorTag: c.color_tag ?? "blue",
    remindBeforeHours: c.remind_before_hours ?? 50,
    equipmentIds: c.equipment_ids ?? [],
  }
}

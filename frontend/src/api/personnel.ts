import { request } from "@/lib/apiClient.ts"
import type { PersonnelBracelet, PersonnelRecord } from "@/lib/personnel.ts"

export interface PersonnelList {
  data: PersonnelRecord[]
  count: number
}

export interface PersonnelActivity {
  present: boolean
  on_shift: boolean
  person_code?: string | null
  runtime_id?: string | null
  zone?: string | null
  motion_status?: string | null
  speed?: number | null
  target?: string | null
  task_id?: string | null
}

export type AvailableBracelet = {
  device_id: string
  code: string
  name: string
  status: string
  battery: number | null
  serial_number?: string | null
}

export type BraceletHistoryItem = {
  id: string
  device_id: string
  device_code?: string | null
  device_name?: string | null
  employee_id: string
  employee_code?: string | null
  employee_name?: string | null
  assigned_at?: string | null
  unassigned_at?: string | null
  previous_device_id?: string | null
  previous_device_code?: string | null
  notes?: string | null
  active: boolean
}

export interface PersonnelWrite {
  employee_code: string
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string
  department: string
  phone?: string | null
  email?: string | null
  status: string
  status_until?: string | null
  shift: string
  hire_date?: string | null
  notes?: string | null
}

export interface PersonnelQuery {
  q?: string
  status?: string
  position?: string
  shift?: string
}

function queryString(params: PersonnelQuery): string {
  const search = new URLSearchParams()
  if (params.q) search.set("q", params.q)
  if (params.status) search.set("status", params.status)
  if (params.position) search.set("position", params.position)
  if (params.shift) search.set("shift", params.shift)
  const text = search.toString()
  return text ? `?${text}` : ""
}

export const personnelApi = {
  list: (params: PersonnelQuery = {}) =>
    request<PersonnelList>(`/api/v1/personnel/${queryString(params)}`),
  get: (id: string) => request<PersonnelRecord>(`/api/v1/personnel/${id}`),
  activity: (id: string) => request<PersonnelActivity>(`/api/v1/personnel/${id}/activity`),
  departments: () =>
    request<{ data: string[]; count: number }>("/api/v1/personnel/departments"),
  create: (body: PersonnelWrite) =>
    request<PersonnelRecord>("/api/v1/personnel/", { method: "POST", body }),
  update: (id: string, body: Partial<PersonnelWrite>) =>
    request<PersonnelRecord>(`/api/v1/personnel/${id}`, { method: "PATCH", body }),
  remove: (id: string) =>
    request<{ message: string }>(`/api/v1/personnel/${id}`, { method: "DELETE" }),
  bulkDepartment: (body: { worker_ids: string[]; department: string }) =>
    request<{
      updated: number
      deleted: number
      worker_ids: string[]
      department: string | null
      message: string
    }>("/api/v1/personnel/bulk/department", { method: "POST", body }),
  bulkDelete: (body: { worker_ids: string[] }) =>
    request<{
      updated: number
      deleted: number
      worker_ids: string[]
      department: string | null
      message: string
    }>("/api/v1/personnel/bulk/delete", { method: "POST", body }),
  availableBracelets: () =>
    request<{ data: AvailableBracelet[]; count: number }>("/api/v1/personnel/bracelets/available"),
  bracelet: (id: string) =>
    request<{ bracelet: PersonnelBracelet | null }>(`/api/v1/personnel/${id}/bracelet`),
  braceletHistory: (id: string) =>
    request<{ data: BraceletHistoryItem[]; count: number }>(
      `/api/v1/personnel/${id}/bracelet/history`,
    ),
  assignBracelet: (id: string, deviceId: string) =>
    request<PersonnelRecord>(`/api/v1/personnel/${id}/bracelet/assign`, {
      method: "POST",
      body: { device_id: deviceId },
    }),
  unassignBracelet: (id: string) =>
    request<PersonnelRecord>(`/api/v1/personnel/${id}/bracelet/unassign`, { method: "POST" }),
  replaceBracelet: (id: string, deviceId: string) =>
    request<PersonnelRecord>(`/api/v1/personnel/${id}/bracelet/replace`, {
      method: "POST",
      body: { device_id: deviceId },
    }),
}

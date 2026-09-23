import { request } from "@/lib/apiClient.ts"
import type { PersonnelRecord } from "@/lib/personnel.ts"

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
  create: (body: PersonnelWrite) =>
    request<PersonnelRecord>("/api/v1/personnel/", { method: "POST", body }),
  update: (id: string, body: Partial<PersonnelWrite>) =>
    request<PersonnelRecord>(`/api/v1/personnel/${id}`, { method: "PATCH", body }),
  deactivate: (id: string) =>
    request<{ message: string }>(`/api/v1/personnel/${id}`, { method: "DELETE" }),
}

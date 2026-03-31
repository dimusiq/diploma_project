import { request } from "@/lib/apiClient.ts"

export interface MaintenanceCalendarEventPublic {
  id: string
  equipment_id: string
  equipment_name: string | null
  chain_id: string | null
  interval_hours: number
  engine_hours: number | null
  next_service_at_hours: number | null
  remaining_hours: number | null
  status: string // overdue | due_soon | ok
}

export interface MaintenanceCalendarEventListResponse {
  data: MaintenanceCalendarEventPublic[]
  count: number
  /** Всего по фильтру до limit; если больше count — список усечён */
  total_matching?: number | null
}

const BASE = "/api/v1/maintenance-calendar-events"

export const maintenanceCalendarApi = {
  list: (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set("status", params.status)
    if (params?.limit != null) q.set("limit", String(params.limit))
    return request<MaintenanceCalendarEventListResponse>(
      `${BASE}${q.toString() ? `?${q.toString()}` : ""}`,
    )
  },
}


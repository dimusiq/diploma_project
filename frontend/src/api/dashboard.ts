/**
 * Запрос трендов дашборда: поступления и отгрузки по дням/неделям.
 */

import { fetchWithAuth, request } from "@/lib/apiClient.ts"

export interface DashboardTrendsParams {
  from?: string // YYYY-MM-DD
  to?: string
  group_by?: "day" | "week"
}

export interface TrendPoint {
  period: string
  count: number
}

export interface DashboardTrendsResponse {
  from: string
  to: string
  group_by: string
  incoming: TrendPoint[]
  shipped: TrendPoint[]
}

export function getDashboardTrends(
  params: DashboardTrendsParams = {},
): Promise<DashboardTrendsResponse> {
  const q = new URLSearchParams()
  if (params.from) q.set("from", params.from)
  if (params.to) q.set("to", params.to)
  if (params.group_by) q.set("group_by", params.group_by)
  const query = q.toString()
  return request<DashboardTrendsResponse>(
    `/api/v1/dashboard/trends${query ? `?${query}` : ""}`,
  )
}

export interface EmployeeProductivityRow {
  user_id: string
  email: string | null
  tasks_completed: number
  lines_completed: number
  hours: number
  tasks_per_hour: number | null
  lines_per_hour: number | null
}

export interface WarehouseKpiResponse {
  from_date: string
  to_date: string
  dock_to_stock_hours_avg: number | null
  dock_to_stock_samples: number
  stock_accuracy: number | null
  stock_accuracy_lines: number
  otif: number | null
  otif_shipped: number
  order_cycle_hours_avg: number | null
  order_cycle_samples: number
  tasks_per_hour: number | null
  lines_per_hour: number | null
  productivity_by_employee: EmployeeProductivityRow[]
  equipment_downtime_hours: number | null
  equipment_downtime_by_reason: Array<{
    reason: string
    hours: number
    work_orders: number
  }>
  mean_dwell_days_warehouse: number | null
  dead_stock_ratio: number | null
  dead_stock_count: number
  warehouse_items_total: number
  dock_utilization: number | null
  dock_touch_events: number
  active_dock_doors: number
  notes: string[]
}

export function getWarehouseKpi(params: {
  from?: string
  to?: string
} = {}): Promise<WarehouseKpiResponse> {
  const q = new URLSearchParams()
  if (params.from) q.set("from", params.from)
  if (params.to) q.set("to", params.to)
  const query = q.toString()
  return request<WarehouseKpiResponse>(
    `/api/v1/dashboard/warehouse-kpi${query ? `?${query}` : ""}`,
  )
}

export async function downloadWarehouseKpiCsv(params: {
  from?: string
  to?: string
} = {}): Promise<void> {
  const q = new URLSearchParams()
  if (params.from) q.set("from", params.from)
  if (params.to) q.set("to", params.to)
  const query = q.toString()
  const res = await fetchWithAuth(
    `/api/v1/dashboard/warehouse-kpi/export${query ? `?${query}` : ""}`,
  )
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition")
  const match = disposition?.match(/filename=(.+)/)
  const filename = match
    ? match[1].replace(/^["']|["']$/g, "")
    : "warehouse-kpi.csv"
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

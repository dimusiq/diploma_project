/**
 * Запрос трендов дашборда: поступления и отгрузки по дням/неделям.
 */

import { request } from "@/lib/apiClient.ts"

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

import { request } from "@/lib/apiClient.ts"

export interface TwinSummary {
  domain_events_by_type: Record<string, number>
  warehouse_items_by_row: Array<{ storage_row: number; item_count: number }>
  warehouse_items_total: number
  items_expiring_within_30_days: number
  layout_capacity_cells: number | null
  occupied_slots: number
  slot_utilization_ratio: number | null
}

export function fetchTwinSummary(): Promise<TwinSummary> {
  return request<TwinSummary>("/api/v1/warehouse/twin/summary")
}

export interface WhatIfResult {
  baseline_occupied_slots: number
  baseline_utilization_ratio: number | null
  projected_occupied_slots: number
  projected_utilization_ratio: number | null
  warehouse_items_by_row_after: Array<{
    storage_row: number
    item_count: number
  }>
}

export function postTwinWhatIf(
  additional_items_by_row: Record<number, number>,
): Promise<WhatIfResult> {
  return request<WhatIfResult>("/api/v1/warehouse/twin/what-if", {
    method: "POST",
    body: { additional_items_by_row },
  })
}

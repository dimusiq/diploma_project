import { request } from "@/lib/apiClient.ts"

export interface InventorySnapshotItem {
  id: string
  warehouse_id: string
  taken_at: string
  label: string | null
  total_items: number
  total_quantity: number
  by_status: Record<string, { count: number; quantity: number }>
}

export interface GetInventorySnapshotsParams {
  from_date?: string
  to_date?: string
}

export function getInventorySnapshots(
  params: GetInventorySnapshotsParams = {},
): Promise<InventorySnapshotItem[]> {
  const q = new URLSearchParams()
  if (params.from_date) q.set("from_date", params.from_date)
  if (params.to_date) q.set("to_date", params.to_date)
  const query = q.toString()
  return request<InventorySnapshotItem[]>(
    `/api/v1/inventory-snapshots/${query ? `?${query}` : ""}`,
  )
}

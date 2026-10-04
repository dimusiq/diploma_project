import { request } from "@/lib/apiClient.ts"

export interface ScanItemInfo {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  quantity: number
  status: string
  description: string | null
  unit: string | null
}

export interface ScanLocationInfo {
  category: string | null
  category_id: string | null
  location: string | null
  storage_row: number | null
  storage_level: number | null
  storage_cell_x: number | null
  storage_cell_z: number | null
}

export interface ScanResult {
  item: ScanItemInfo
  location: ScanLocationInfo
  quick_actions: string[]
}

export interface ScanConfirmPickBody {
  order_id: string
  task_id: string
  code: string
  outcome?: "ok" | "no_stock"
  scanned_slot_key?: string | null
  quantity?: number | null
  reason?: string | null
}

export interface ScanConfirmPickResult {
  order_id: string
  order_status: string
  task_id: string
  status: string
  idempotent?: boolean
  incident?: Record<string, unknown> | null
  alternative?: Record<string, unknown> | null
  confirmed_quantity?: number | null
  item_id?: string | null
}

export const scanApi = {
  lookup: (code: string) =>
    request<ScanResult>(
      `/api/v1/scan?code=${encodeURIComponent(code)}`,
    ),
  confirmPick: (body: ScanConfirmPickBody) =>
    request<ScanConfirmPickResult>("/api/v1/scan/confirm-pick", {
      method: "POST",
      body,
    }),
}

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

export const scanApi = {
  lookup: (code: string) =>
    request<ScanResult>(
      `/api/v1/scan?code=${encodeURIComponent(code)}`,
    ),
}

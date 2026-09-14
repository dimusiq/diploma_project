export type WarehouseInteractionMode = "view" | "route"

export interface CellInfo {
  row: number
  level: number
  cellX: number
  cellZ: number
  filled: boolean
}

export interface CellItemInfo {
  id?: string
  title: string
  description?: string | null
  quantity?: number
  unit?: string | null
  sku?: string | null
  expires_at?: string | null
  location?: string | null
  status: string
  expiringSoon?: boolean
  isExpired?: boolean
  expiredDays?: number
}

export type TwinOverlayMode =
  | "standard"
  | "occupancy"
  | "workload"
  | "replenishment_need"
  | "anomaly_alerts"
  | "maintenance_safety"

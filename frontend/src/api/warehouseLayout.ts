/**
 * Активная конфигурация геометрии склада (цифровой двойник).
 */
import type { WarehouseLayoutSpec } from "@/components/warehouse3d/warehouseGeometry.tsx"
import { request } from "@/lib/apiClient.ts"

export interface WarehouseLayoutResponse {
  id: string
  code: string
  version: number
  is_active: boolean
  spec: Record<string, unknown>
  warehouse_id?: string | null
  spec_schema_version: number
  lifecycle_status: "draft" | "published" | "archived" | string
  published_at?: string | null
  activated_at?: string | null
}

export async function fetchWarehouseLayout(): Promise<WarehouseLayoutResponse> {
  return request<WarehouseLayoutResponse>("/api/v1/warehouse/layout")
}

export interface WarehouseSlotOccupancyEntry {
  slot_key: string
  item_id: string
}

export interface WarehouseOccupancyResponse {
  data: WarehouseSlotOccupancyEntry[]
  count: number
}

export async function fetchWarehouseOccupancy(): Promise<WarehouseOccupancyResponse> {
  return request<WarehouseOccupancyResponse>("/api/v1/warehouse/occupancy")
}

export function specToLayoutGeometry(
  spec: Record<string, unknown> | undefined,
): WarehouseLayoutSpec | null {
  if (!spec || typeof spec !== "object") return null
  const rows = Number(spec.rows)
  const levels = Number(spec.levels)
  const cellX = Number(spec.cellX)
  const cellZ = Number(spec.cellZ)
  if (
    !Number.isFinite(rows) ||
    !Number.isFinite(levels) ||
    !Number.isFinite(cellX) ||
    !Number.isFinite(cellZ) ||
    rows < 1 ||
    levels < 1 ||
    cellX < 1 ||
    cellZ < 1
  ) {
    return null
  }
  return {
    rows: Math.floor(rows),
    levels: Math.floor(levels),
    cellX: Math.floor(cellX),
    cellZ: Math.floor(cellZ),
  }
}

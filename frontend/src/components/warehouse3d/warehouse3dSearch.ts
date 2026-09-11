import { z } from "zod"
import type { CellInfo } from "@/components/warehouse3d/WarehouseScene.tsx"
import {
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
  type WarehouseLayoutSpec,
} from "@/components/warehouse3d/warehouseGeometry.tsx"

export const CELL_FILTER_VALUES = [
  "all",
  "empty",
  "occupied",
  "expiring",
  "expired",
] as const

export type CellFilter = (typeof CELL_FILTER_VALUES)[number]

export const warehouse3dSearchSchema = z.object({
  row: z.coerce.number().int().positive().optional(),
  level: z.coerce.number().int().positive().optional(),
  cellX: z.coerce.number().int().positive().optional(),
  cellZ: z.coerce.number().int().positive().optional(),
  filter: z.enum(CELL_FILTER_VALUES).optional(),
})

export type Warehouse3dSearch = z.infer<typeof warehouse3dSearchSchema>

export function clampSearchToLayout(
  search: Warehouse3dSearch,
  spec: WarehouseLayoutSpec = DEFAULT_WAREHOUSE_LAYOUT_SPEC,
): Warehouse3dSearch {
  const out: Warehouse3dSearch = { ...search }
  if (out.row != null) {
    out.row = Math.min(Math.max(1, out.row), spec.rows)
  }
  if (out.level != null) {
    out.level = Math.min(Math.max(1, out.level), spec.levels)
  }
  if (out.cellX != null) {
    out.cellX = Math.min(Math.max(1, out.cellX), spec.cellX)
  }
  if (out.cellZ != null) {
    out.cellZ = Math.min(Math.max(1, out.cellZ), spec.cellZ)
  }
  if (out.filter && !CELL_FILTER_VALUES.includes(out.filter)) {
    out.filter = "all"
  }
  return out
}

export function searchToCellInfo(
  search: Warehouse3dSearch,
  spec: WarehouseLayoutSpec = DEFAULT_WAREHOUSE_LAYOUT_SPEC,
): CellInfo | null {
  const s = clampSearchToLayout(search, spec)
  if (s.row != null && s.level != null && s.cellX != null) {
    return {
      row: s.row - 1,
      level: s.level - 1,
      cellX: s.cellX - 1,
      cellZ: (s.cellZ ?? 1) - 1,
      filled: false,
    }
  }
  return null
}

export function cellInfoToSearch(
  cell: CellInfo | null,
  filter: CellFilter,
): Warehouse3dSearch {
  if (!cell) {
    return filter === "all" ? {} : { filter }
  }
  return {
    row: cell.row + 1,
    level: cell.level + 1,
    cellX: cell.cellX + 1,
    cellZ: cell.cellZ + 1,
    ...(filter !== "all" ? { filter } : {}),
  }
}

export function parseCellFilter(raw: unknown): CellFilter {
  if (
    typeof raw === "string" &&
    CELL_FILTER_VALUES.includes(raw as CellFilter)
  ) {
    return raw as CellFilter
  }
  return "all"
}

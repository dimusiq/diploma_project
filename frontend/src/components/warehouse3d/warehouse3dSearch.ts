import { z } from "zod"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
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

const optionalPositiveInt = z.preprocess((v) => {
  if (v == null || v === "") return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return n
}, z.number().int().positive().optional())

export const warehouse3dSearchSchema = z.object({
  row: optionalPositiveInt,
  level: optionalPositiveInt,
  cellX: optionalPositiveInt,
  cellZ: optionalPositiveInt,
  filter: z.enum(CELL_FILTER_VALUES).optional().catch(undefined),
  taskId: z.preprocess((v) => {
    if (v == null || v === "") return undefined
    if (typeof v === "string") return v
    return undefined
  }, z.string().uuid().optional().catch(undefined)),
})

export type Warehouse3dSearch = z.infer<typeof warehouse3dSearchSchema>

export function validateWarehouse3dSearch(
  search: Record<string, unknown>,
): Warehouse3dSearch {
  const parsed = warehouse3dSearchSchema.safeParse(search)
  if (parsed.success) return parsed.data
  return { filter: parseCellFilter(search.filter) }
}

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
  extras?: { taskId?: string },
): Warehouse3dSearch {
  const taskId = extras?.taskId
  if (!cell) {
    return {
      ...(filter === "all" ? {} : { filter }),
      ...(taskId ? { taskId } : {}),
    }
  }
  return {
    row: cell.row + 1,
    level: cell.level + 1,
    cellX: cell.cellX + 1,
    cellZ: cell.cellZ + 1,
    ...(filter !== "all" ? { filter } : {}),
    ...(taskId ? { taskId } : {}),
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

export function cellMatchesFilter(
  filter: string | undefined,
  filled: boolean,
  expiring: boolean,
  expired: boolean,
): boolean {
  switch (filter) {
    case "empty":
      return !filled
    case "occupied":
      return filled
    case "expiring":
      return expiring
    case "expired":
      return expired
    default:
      return true
  }
}

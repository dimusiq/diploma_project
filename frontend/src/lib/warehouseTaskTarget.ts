import { parseSlotKeyZeroBased } from "@/components/warehouse3d/twin3dDerived.ts"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import type { Warehouse3dSearch } from "@/components/warehouse3d/warehouse3dSearch.ts"

export type WarehouseTaskTarget = {
  itemId?: string
  slotKey?: string
  cell: CellInfo | null
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim()
  return undefined
}

/** Достаёт item_id / slot_key / ячейку из payload складского задания. */
export function parseWarehouseTaskTarget(
  payload: Record<string, unknown> | null | undefined,
): WarehouseTaskTarget {
  if (!payload) return { cell: null }
  const itemId = str(payload.item_id) ?? str(payload.itemId)
  const slotKey = str(payload.slot_key) ?? str(payload.slotKey)

  const row1 =
    num(payload.storage_row) ?? num(payload.row) ?? num(payload.row_1based)
  const level1 =
    num(payload.storage_level) ??
    num(payload.level) ??
    num(payload.level_1based)
  const cellX1 =
    num(payload.storage_cell_x) ??
    num(payload.cellX) ??
    num(payload.cell_x)
  const cellZ1 =
    num(payload.storage_cell_z) ??
    num(payload.cellZ) ??
    num(payload.cell_z) ??
    1

  let cell: CellInfo | null = null
  if (row1 != null && level1 != null && cellX1 != null) {
    cell = {
      row: Math.max(0, Math.floor(row1) - 1),
      level: Math.max(0, Math.floor(level1) - 1),
      cellX: Math.max(0, Math.floor(cellX1) - 1),
      cellZ: Math.max(0, Math.floor(cellZ1) - 1),
      filled: false,
    }
  } else if (slotKey) {
    const parsed = parseSlotKeyZeroBased(slotKey)
    if (parsed) {
      cell = {
        row: parsed[0],
        level: parsed[1],
        cellX: parsed[2],
        cellZ: parsed[3],
        filled: false,
      }
    }
  }

  return { itemId, slotKey, cell }
}

export function taskTargetToSearch(
  taskId: string,
  target: WarehouseTaskTarget,
): Warehouse3dSearch {
  const s: Warehouse3dSearch = { taskId }
  if (target.cell) {
    s.row = target.cell.row + 1
    s.level = target.cell.level + 1
    s.cellX = target.cell.cellX + 1
    s.cellZ = target.cell.cellZ + 1
  }
  return s
}

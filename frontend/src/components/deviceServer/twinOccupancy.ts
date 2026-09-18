import { simCellIdToSlotKey } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import type { RackFill } from "./simStore.ts"

/** Ячейки с паллетой из снимка симуляции → ключи 3D-сетки. */
export function occupiedCellKeysFromIds(
  ids: string[] | undefined | null,
): Set<string> {
  const keys = new Set<string>()
  for (const id of ids ?? []) {
    const key = simCellIdToSlotKey(id)
    if (key) keys.add(key)
  }
  return keys
}

/**
 * Запасной вариант, если в снимке нет списка ячеек:
 * заполняет первые N ячеек стеллажа по rackFill.
 */
export function occupiedCellKeysFromRackFill(rackFill: RackFill[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rackFill) {
    const match = /^rack-(\d+)-([ABLR])$/.exec(row.rackId)
    if (!match) continue
    const rackIndex =
      (Number(match[1]) - 1) * 2 + (match[2] === "B" || match[2] === "R" ? 1 : 0)
    let left = row.occupied
    for (let level = 0; level < 3 && left > 0; level += 1) {
      for (let ix = 0; ix < 12 && left > 0; ix += 1) {
        keys.add(`${rackIndex}-${level}-${ix}-0`)
        left -= 1
      }
    }
  }
  return keys
}

export function occupiedCellKeysForTwin(
  occupiedCellIds: string[] | undefined,
  rackFill: RackFill[],
): Set<string> {
  if (occupiedCellIds && occupiedCellIds.length > 0) {
    return occupiedCellKeysFromIds(occupiedCellIds)
  }
  return occupiedCellKeysFromRackFill(rackFill)
}

export type TwinOccupancyStats = {
  total: number
  occupied: number
  empty: number
  percent: number
  visualKeys: number
}

export function occupancyStatsForTwin(
  cellsTotal: number,
  cellsOccupied: number,
  occupiedCellIds: string[] | undefined,
  rackFill: RackFill[],
): TwinOccupancyStats {
  const keys = occupiedCellKeysForTwin(occupiedCellIds, rackFill)
  const occupied =
    occupiedCellIds && occupiedCellIds.length > 0
      ? occupiedCellIds.length
      : cellsOccupied
  const total = cellsTotal > 0 ? cellsTotal : occupied
  const empty = Math.max(0, total - occupied)
  const percent = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0
  return {
    total,
    occupied,
    empty,
    percent,
    visualKeys: keys.size,
  }
}

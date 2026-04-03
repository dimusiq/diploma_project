import type { TopologyDocument } from "@/api/warehouseTopology.ts"
import type { ItemPublic } from "@/client/index.ts"
import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

const EXPIRING_DAYS = 30

function cellKeyFromItem1Based(
  row: number,
  level: number,
  cellX: number,
  cellZ: number,
): string {
  return `${row - 1}-${level - 1}-${cellX - 1}-${cellZ - 1}`
}

function itemCellKey(item: ItemPublic): string | null {
  if (item.slot_key) return item.slot_key
  const r = item.storage_row
  const l = item.storage_level
  const x = item.storage_cell_x
  const z = item.storage_cell_z
  if (r != null && l != null && x != null && z != null) {
    return cellKeyFromItem1Based(r, l, x, z)
  }
  return null
}

function daysToExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null
  const exp = new Date(expiresAt)
  const now = new Date()
  return Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

export type HeatMetric = "congestion" | "pick_density" | "sla_risk"

export type CellStripe = "blocked" | "reserved" | "quarantine"

/** Congestion: доля занятости ряда относительно max по ряду (одинаковый цвет для всех ячеек ряда). */
export function congestionByCellKey(
  items: ItemPublic[],
  geom: WarehouseGeometry,
): Map<string, number> {
  const perRow = new Map<number, number>()
  for (let r = 0; r < geom.rackRows; r++) {
    perRow.set(r, 0)
  }
  for (const item of items) {
    const r = item.storage_row
    if (r != null && r >= 1 && r <= geom.rackRows) {
      const idx = r - 1
      perRow.set(idx, (perRow.get(idx) ?? 0) + 1)
    }
  }
  let maxRow = 1
  for (const c of perRow.values()) {
    maxRow = Math.max(maxRow, c)
  }
  const out = new Map<string, number>()
  for (let row = 0; row < geom.rackRows; row++) {
    const v = Math.min(1, (perRow.get(row) ?? 0) / maxRow)
    for (let lv = 0; lv < geom.levels; lv++) {
      for (let ix = 0; ix < geom.cellsLength; ix++) {
        for (let iz = 0; iz < geom.cellsDepth; iz++) {
          out.set(`${row}-${lv}-${ix}-${iz}`, v)
        }
      }
    }
  }
  return out
}

/** Плотность отбора: сумма quantity по ячейке / max. */
export function pickDensityByCellKey(items: ItemPublic[]): Map<string, number> {
  const qty = new Map<string, number>()
  for (const item of items) {
    const k = itemCellKey(item)
    if (!k) continue
    const q = item.quantity ?? 1
    qty.set(k, (qty.get(k) ?? 0) + q)
  }
  let maxQ = 1
  for (const v of qty.values()) {
    maxQ = Math.max(maxQ, v)
  }
  const out = new Map<string, number>()
  for (const [k, v] of qty) {
    out.set(k, Math.min(1, v / maxQ))
  }
  return out
}

/** SLA risk: чем меньше дней до срока, тем выше 0…1. */
export function slaRiskByCellKey(items: ItemPublic[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const item of items) {
    const k = itemCellKey(item)
    if (!k) continue
    const d = daysToExpiry(item.expires_at ?? null)
    if (d == null) continue
    if (d < 0) {
      out.set(k, 1)
      continue
    }
    if (d <= EXPIRING_DAYS) {
      out.set(k, Math.max(out.get(k) ?? 0, 1 - d / EXPIRING_DAYS))
    }
  }
  return out
}

/** Низкий остаток в ячейке (эвристика пополнения). */
export function replenishmentNeedByCellKey(
  items: ItemPublic[],
  threshold = 3,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const item of items) {
    const k = itemCellKey(item)
    if (!k) continue
    const q = item.quantity ?? 1
    if (q < threshold) {
      out.set(k, Math.max(out.get(k) ?? 0, 1 - q / threshold))
    }
  }
  return out
}

const QUARANTINE_RE = /карантин|quarantine/i

export function stripeByCellKey(items: ItemPublic[]): Map<string, CellStripe> {
  const out = new Map<string, CellStripe>()
  for (const item of items) {
    const k = itemCellKey(item)
    if (!k) continue
    if (item.status === "shipment") {
      out.set(k, "reserved")
    }
    if (item.status === "incoming") {
      out.set(k, "quarantine")
    }
    const text = `${item.title ?? ""} ${item.description ?? ""} ${item.location ?? ""}`
    if (QUARANTINE_RE.test(text)) {
      out.set(k, "quarantine")
    }
  }
  return out
}

/** Ячейки в буферных рядах топологии — «блокировка» проезда/зоны. */
export function blockedCellKeysFromTopology(
  geom: WarehouseGeometry,
  topology: TopologyDocument | null | undefined,
): Set<string> {
  const blocked = new Set<string>()
  if (!topology?.buffer_zones?.length) return blocked
  for (const b of topology.buffer_zones) {
    const r0 = b.row_from_1based
    const r1 = b.row_to_1based
    if (r0 == null || r1 == null) continue
    for (let r = r0; r <= r1; r++) {
      const row0 = r - 1
      if (row0 < 0 || row0 >= geom.rackRows) continue
      for (let lv = 0; lv < geom.levels; lv++) {
        for (let ix = 0; ix < geom.cellsLength; ix++) {
          for (let iz = 0; iz < geom.cellsDepth; iz++) {
            blocked.add(`${row0}-${lv}-${ix}-${iz}`)
          }
        }
      }
    }
  }
  return blocked
}

export function heatMapForMetric(
  metric: HeatMetric,
  items: ItemPublic[],
  geom: WarehouseGeometry,
): Map<string, number> {
  switch (metric) {
    case "congestion":
      return congestionByCellKey(items, geom)
    case "pick_density":
      return pickDensityByCellKey(items)
    case "sla_risk":
      return slaRiskByCellKey(items)
    default:
      return new Map()
  }
}

/**
 * Мост между планом «Сервера устройств» (simLayout) и 3D-складом.
 * Общий layout-модуль не выносим — импортируем simLayout напрямую.
 */
import {
  buildTopology,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
  WEST_CORRIDOR_X,
  EAST_CORRIDOR_X,
  ZONES,
} from "@/components/deviceServer/simLayout.ts"
import type { SimDock, SimRack, SimTopology } from "@/components/deviceServer/simTypes.ts"
import type { WarehouseLayoutSpec } from "@/components/warehouse3d/warehouseGeometry.tsx"
import { parseSlotKeyZeroBased } from "@/components/warehouse3d/twin3dDerived.ts"

/** Размеры сетки, совпадающие с симулятором устройств. */
export const FLOOR_PLAN_LAYOUT_SPEC: WarehouseLayoutSpec = {
  rows: 8,
  levels: 3,
  cellX: 12,
  cellZ: 1,
}

export function isFloorPlanLayoutSpec(spec: WarehouseLayoutSpec): boolean {
  return (
    spec.rows === FLOOR_PLAN_LAYOUT_SPEC.rows &&
    spec.levels === FLOOR_PLAN_LAYOUT_SPEC.levels &&
    spec.cellX === FLOOR_PLAN_LAYOUT_SPEC.cellX &&
    spec.cellZ === FLOOR_PLAN_LAYOUT_SPEC.cellZ
  )
}

export function resolveFloorPlanLayoutSpec(
  spec: WarehouseLayoutSpec | null | undefined,
): WarehouseLayoutSpec {
  const s = spec ?? FLOOR_PLAN_LAYOUT_SPEC
  return isFloorPlanLayoutSpec(s) ? s : FLOOR_PLAN_LAYOUT_SPEC
}

/** Координаты плана (м) → мир Three.js (центр здания в начале координат). */
export function planToWorldX(planX: number): number {
  return planX - WAREHOUSE_WIDTH / 2
}

export function planToWorldZ(planZ: number): number {
  return planZ - WAREHOUSE_DEPTH / 2
}

export function planToWorldY(planY: number): number {
  return planY
}

let cachedTopology: SimTopology | null = null

export function getFloorPlanTopology(): SimTopology {
  if (!cachedTopology) cachedTopology = buildTopology()
  return cachedTopology
}

export function getFloorPlanRacks(): SimRack[] {
  return getFloorPlanTopology().racks
}

export function getFloorPlanDocks(): SimDock[] {
  return getFloorPlanTopology().docks
}

/** slot_key API: row-level-cellX-cellZ ↔ sim R01-01-1 (стеллаж–ячейка–уровень). */
export function simCellIdToSlotKey(simCellId: string): string | null {
  const m = /^R(\d{2})-(\d{2})-(\d+)$/.exec(simCellId.trim())
  if (!m) return null
  const row = Number(m[1]) - 1
  const cellX = Number(m[2]) - 1
  const level = Number(m[3]) - 1
  if (row < 0 || cellX < 0 || level < 0) return null
  return `${row}-${level}-${cellX}-0`
}

export function slotKeyToSimCellId(slotKey: string): string | null {
  const parsed = parseSlotKeyZeroBased(slotKey)
  if (!parsed) return null
  const [row, level, cellX] = parsed
  return `R${String(row + 1).padStart(2, "0")}-${String(cellX + 1).padStart(2, "0")}-${level + 1}`
}

/** Нормализует slot_key: поддерживает и dash-формат API, и sim R01-01-1. */
export function normalizeSlotKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  if (parseSlotKeyZeroBased(trimmed)) return trimmed
  return simCellIdToSlotKey(trimmed)
}

export const FLOOR_PLAN_AISLE_Z = getFloorPlanTopology().aisleZ
export const FLOOR_PLAN_CORRIDOR_X = [WEST_CORRIDOR_X, EAST_CORRIDOR_X] as const
export { WAREHOUSE_WIDTH, WAREHOUSE_DEPTH, ZONES }

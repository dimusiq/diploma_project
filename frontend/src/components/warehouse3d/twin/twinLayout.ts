/**
 * Pure layout helpers for Twin infrastructure.
 * Positions come from backend/simLayout via the floor-plan adapter — no extra warehouse state.
 */
import type { SimDock, SimZone } from "@/components/deviceServer/simTypes.ts"
import {
  dockFacadeWorldX,
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

/** Высота и толщина внешней стены Twin (единый фасад для стен и ворот). */
export const TWIN_WALL_HEIGHT = 4.2
export const TWIN_WALL_THICKNESS = 0.18

/**
 * Половина проёма во внешней стене (м).
 * Проём чуть уже рамы, чтобы рама сидела в фасаде без зазора.
 */
export const DOCK_OPENING_HALF = 1.74
export const DOCK_FRAME_WIDTH = 3.56
export const DOCK_DOOR_WIDTH = 3.05

export const ZONE_LABELS: Record<string, string> = {
  receiving: "RECEIVING",
  storage: "STORAGE",
  picking: "PICKING",
  packing: "PACKING",
  shipping: "SHIPPING",
  charging: "CHARGING",
  yard: "YARD",
}

export const ZONE_TINTS: Record<string, string> = {
  receiving: "#38bdf8",
  storage: "#94a3b8",
  picking: "#fb923c",
  packing: "#a78bfa",
  shipping: "#34d399",
  charging: "#fbbf24",
  yard: "#cbd5e1",
}

export function zoneWorldRect(zone: SimZone) {
  return {
    x: planToWorldX(zone.x + zone.w / 2),
    z: planToWorldZ(zone.z + zone.d / 2),
    w: zone.w,
    d: zone.d,
  }
}

/** Small sign at the zone corner so it does not cover racks. */
export function zoneSignWorldPos(zone: SimZone) {
  return {
    x: planToWorldX(zone.x + Math.min(2.2, zone.w * 0.18)),
    z: planToWorldZ(zone.z + Math.min(2.2, zone.d * 0.18)),
  }
}

/**
 * 3D-поза ворот: логический dock.pos остаётся для simulation/2D,
 * геометрия двери ставится в плоскость внешней стены.
 * Локальный +Z модели смотрит внутрь склада.
 */
export function dockWorldPose(dock: SimDock) {
  return {
    x: dockFacadeWorldX(dock.direction),
    z: planToWorldZ(dock.pos.z),
    yardX: planToWorldX(dock.yardPos.x),
    yardZ: planToWorldZ(dock.yardPos.z),
    /** Model faces +Z; inbound looks into the building (+X). */
    rotationY: dock.direction === "inbound" ? Math.PI / 2 : -Math.PI / 2,
  }
}

export function truckWorldPose(args: {
  x: number
  z: number
  direction: "inbound" | "outbound"
}) {
  return {
    x: planToWorldX(args.x),
    z: planToWorldZ(args.z),
    /** Кабина в сторону площадки, кузов к воротам. */
    rotationY: args.direction === "inbound" ? -Math.PI / 2 : Math.PI / 2,
  }
}

export function chargingSlotPlanPositions(zone: SimZone, count = 4) {
  const n = Math.max(1, count)
  const slots: Array<{ x: number; z: number }> = []
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    slots.push({
      x: zone.x + Math.min(7, zone.w * 0.42),
      z: zone.z + 1.8 + t * Math.max(2, zone.d - 3.6),
    })
  }
  return slots
}

export function aisleLabel(index: number): string {
  return `A${String(index + 1).padStart(2, "0")}`
}

export function wallSegments(
  halfSpan: number,
  gaps: number[],
  gapHalf: number,
): Array<{ center: number; length: number }> {
  const sorted = [...gaps].sort((a, b) => a - b)
  const segs: Array<{ center: number; length: number }> = []
  let start = -halfSpan
  for (const g of sorted) {
    const a = Math.max(-halfSpan, g - gapHalf)
    const b = Math.min(halfSpan, g + gapHalf)
    if (a > start) segs.push({ center: (start + a) / 2, length: a - start })
    start = Math.max(start, b)
  }
  if (start < halfSpan) {
    segs.push({ center: (start + halfSpan) / 2, length: halfSpan - start })
  }
  return segs
}

/**
 * Pure layout helpers for Twin infrastructure.
 * Positions come from backend/simLayout via the floor-plan adapter — no extra warehouse state.
 */
import type { SimDock, SimZone } from "@/components/deviceServer/simTypes.ts"
import {
  dockFacadeWorldX,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_FACADE_X,
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
export const DOCK_JAMB_W = 0.22
export const DOCK_HEADER_H = 0.36

/** Нижняя кромка перемычки. Закрытое полотно доходит до неё без щели. */
export const DOCK_GATE_TOP = TWIN_WALL_HEIGHT - DOCK_HEADER_H
export const DOCK_GATE_HEIGHT = DOCK_GATE_TOP

/** Внутренняя грань фасада. Локальный +Z модели ворот смотрит внутрь склада. */
export const DOCK_INNER_FACE_Z = TWIN_WALL_THICKNESS / 2

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

/** Столбики у рамы, на внутреннем полу, вне проёма. */
export function dockBollardLocals(): Array<[number, number, number]> {
  const lateral = DOCK_FRAME_WIDTH / 2 + 0.28
  const z = DOCK_INNER_FACE_Z + 0.45
  return [
    [-lateral, 0, z],
    [lateral, 0, z],
  ]
}

/** Жёлтая зона перед воротами: целиком на внутреннем полу, симметрично проёму. */
export function dockHazardLocal() {
  const depth = 2.15
  const near = DOCK_INNER_FACE_Z + 1.05
  return {
    width: DOCK_FRAME_WIDTH + 0.24,
    depth,
    centerZ: near + depth / 2,
    stripeXs: [-1.15, -0.38, 0.38, 1.15] as const,
  }
}

/** Локальная точка ворот в мире. +Z модели — внутрь склада на обоих фасадах. */
export function dockLocalToWorld(
  dock: SimDock,
  local: { x: number; z: number },
): { x: number; z: number } {
  const pose = dockWorldPose(dock)
  const cos = Math.cos(pose.rotationY)
  const sin = Math.sin(pose.rotationY)
  return {
    x: pose.x + local.x * cos + local.z * sin,
    z: pose.z - local.x * sin + local.z * cos,
  }
}

export function dockPointInsideWarehouse(
  dock: SimDock,
  local: { x: number; z: number },
): boolean {
  const world = dockLocalToWorld(dock, local)
  const margin = TWIN_WALL_THICKNESS / 2
  return (
    world.x > WAREHOUSE_FACADE_X.west + margin - 1e-4 &&
    world.x < WAREHOUSE_FACADE_X.east - margin + 1e-4
  )
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

/**
 * Маршруты техники по проходам: вдоль рядов (ось X при Z прохода) и
 * смена ряда только у торца площадки (X за пределами стеллажа по длине).
 */
import { Vector3 } from "three"

import {
  FLOOR_PLAN_AISLE_Z,
  getFloorPlanRacks,
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import {
  PASSAGE_WIDTH,
  type WarehouseGeometry,
} from "@/components/warehouse3d/warehouseGeometry.tsx"

const EPS = 0.02

/** Z центра прохода перед рядом (внешняя сторона блока стеллажей). */
export function pickLaneWorldZ(
  geom: WarehouseGeometry,
  rowIndex: number,
): number {
  if (geom.floorPlanMode) {
    const rack = getFloorPlanRacks()[rowIndex]
    if (!rack) return 0
    const rackCenterZ = planToWorldZ(rack.z + rack.d / 2)
    let best = planToWorldZ(FLOOR_PLAN_AISLE_Z[0] ?? 0)
    for (const aisleZ of FLOOR_PLAN_AISLE_Z) {
      const wz = planToWorldZ(aisleZ)
      if (Math.abs(wz - rackCenterZ) < Math.abs(best - rackCenterZ)) {
        best = wz
      }
    }
    return best
  }
  const p = Math.floor(rowIndex / 2)
  const inPair = rowIndex % 2
  const blockStart = -geom.totalZ / 2 + p * (geom.blockWidth + PASSAGE_WIDTH)
  let z: number
  if (inPair === 0) {
    z = blockStart - PASSAGE_WIDTH / 2
  } else {
    z = blockStart + geom.blockWidth + PASSAGE_WIDTH / 2
  }
  return z + geom.storageZOffset
}

export type WarehouseRouteWaypoint = {
  row: number
  level: number
  cellX: number
  cellZ: number
}

function cellIndexToWorldX(
  geom: WarehouseGeometry,
  cellX: number,
  row = 0,
): number {
  if (geom.floorPlanMode) {
    const [x] = geom.getCellWorldPosition(row, 0, cellX, 0)
    return x
  }
  const step = geom.cellSize + geom.cellGap
  return (cellX - (geom.cellsLength - 1) / 2) * step
}

function endCapWorldX(geom: WarehouseGeometry, side: -1 | 1): number {
  if (geom.floorPlanMode) {
    return side < 0 ? planToWorldX(24) : planToWorldX(76)
  }
  const margin = (geom.floorWidth - geom.rackLength) / 2
  return side * (geom.rackLength / 2 + margin * 0.65)
}

function appendUnique(out: Vector3[], pt: Vector3) {
  const last = out[out.length - 1]
  if (!last || last.distanceTo(pt) > EPS) {
    out.push(pt)
  }
}

/** Точка разгрузки в проходе (X по колонке ячейки, Z — проход ряда). */
export function stagingPointOnFloor(
  geom: WarehouseGeometry,
  w: WarehouseRouteWaypoint,
  floorY: number,
): Vector3 {
  const x = cellIndexToWorldX(geom, w.cellX, w.row)
  const z = pickLaneWorldZ(geom, w.row)
  return new Vector3(x, floorY, z)
}

/**
 * Сегмент по проходам: все точки в коридоре перед рядами (не внутри объёма стеллажа).
 */
export function segmentThroughAisles(
  geom: WarehouseGeometry,
  origin: WarehouseRouteWaypoint,
  dest: WarehouseRouteWaypoint,
  floorY: number,
): Vector3[] {
  const xa = cellIndexToWorldX(geom, origin.cellX, origin.row)
  const xb = cellIndexToWorldX(geom, dest.cellX, dest.row)
  const za = pickLaneWorldZ(geom, origin.row)
  const zb = pickLaneWorldZ(geom, dest.row)
  const p0 = new Vector3(xa, floorY, za)

  if (origin.row === dest.row) {
    return [p0, new Vector3(xb, floorY, zb)]
  }

  const xLeft = endCapWorldX(geom, -1)
  const xRight = endCapWorldX(geom, 1)
  const costLeft = Math.abs(xa - xLeft) + Math.abs(xb - xLeft)
  const costRight = Math.abs(xa - xRight) + Math.abs(xb - xRight)
  const xEnd = costLeft <= costRight ? xLeft : xRight

  return [
    p0,
    new Vector3(xEnd, floorY, za),
    new Vector3(xEnd, floorY, zb),
    new Vector3(xb, floorY, zb),
  ]
}

/** Полная полилиния по всем waypoints подряд. */
export function buildAisleRoutePolyline(
  geom: WarehouseGeometry,
  waypoints: WarehouseRouteWaypoint[],
  floorY: number,
): Vector3[] {
  if (waypoints.length === 0) return []
  if (waypoints.length === 1) {
    return [stagingPointOnFloor(geom, waypoints[0], floorY)]
  }
  const out: Vector3[] = []
  out.push(stagingPointOnFloor(geom, waypoints[0], floorY))
  for (let i = 1; i < waypoints.length; i++) {
    const seg = segmentThroughAisles(
      geom,
      waypoints[i - 1],
      waypoints[i],
      floorY,
    )
    for (let k = 1; k < seg.length; k++) {
      appendUnique(out, seg[k])
    }
  }
  return out
}

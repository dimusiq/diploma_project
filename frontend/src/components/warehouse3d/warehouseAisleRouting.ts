/**
 * Маршруты техники по проходам: вдоль рядов (ось X при Z прохода) и
 * смена ряда только у торца площадки (X за пределами стеллажа по длине).
 */
import { Vector3 } from "three"

import {
  CELL_GAP,
  CELL_SIZE,
  PASSAGE_WIDTH,
  type WarehouseGeometry,
} from "@/components/warehouse3d/warehouseGeometry.tsx"

const EPS = 0.02

/** Z центра прохода перед рядом (внешняя сторона блока стеллажей). */
export function pickLaneWorldZ(
  geom: WarehouseGeometry,
  rowIndex: number,
): number {
  const p = Math.floor(rowIndex / 2)
  const inPair = rowIndex % 2
  const blockStart = -geom.totalZ / 2 + p * (geom.blockWidth + PASSAGE_WIDTH)
  if (inPair === 0) {
    return blockStart - PASSAGE_WIDTH / 2
  }
  return blockStart + geom.blockWidth + PASSAGE_WIDTH / 2
}

export type WarehouseRouteWaypoint = {
  row: number
  level: number
  cellX: number
  cellZ: number
}

function cellIndexToWorldX(geom: WarehouseGeometry, cellX: number): number {
  return (cellX - (geom.cellsLength - 1) / 2) * (CELL_SIZE + CELL_GAP)
}

function endCapWorldX(geom: WarehouseGeometry, side: -1 | 1): number {
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
  const x = cellIndexToWorldX(geom, w.cellX)
  const z = pickLaneWorldZ(geom, w.row)
  return new Vector3(x, floorY, z)
}

/** Сегмент: проход origin -> торец площадки -> проход dest (без сквозняка). */
export function segmentThroughAisles(
  geom: WarehouseGeometry,
  origin: WarehouseRouteWaypoint,
  dest: WarehouseRouteWaypoint,
  floorY: number,
): Vector3[] {
  const xa = cellIndexToWorldX(geom, origin.cellX)
  const xb = cellIndexToWorldX(geom, dest.cellX)
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

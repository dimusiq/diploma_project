/**
 * Геометрия склада для 3D: сетка из spec API или план «Сервера устройств» (8×3×12).
 */
import { createContext, type ReactNode, useContext, useMemo } from "react"
import {
  FLOOR_PLAN_LAYOUT_SPEC,
  getFloorPlanRacks,
  isFloorPlanLayoutSpec,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

const CELL_SIZE = 0.72
const CELL_GAP = 0.12
const LEVEL_HEIGHT = 0.82
const PASSAGE_WIDTH = 2.5

/** Метры на ячейку в режиме плана симулятора (48 м / 12 ячеек). */
const FLOOR_PLAN_BAY_WIDTH = 4
const FLOOR_PLAN_CELL_GAP = 0
const FLOOR_PLAN_LEVEL_HEIGHT = 1.35
const FLOOR_PLAN_CELL_HEIGHT = 1.05
/** Меньше глубины стеллажа, чтобы A/B не пересекались на общей спине. */
const FLOOR_PLAN_CELL_DEPTH = 1.55

/**
 * Дополнительная глубина пола со стороны доков (legacy-сетка).
 */
export const DOCK_STAGING_DEPTH = 14

export type WarehouseLayoutSpec = {
  rows: number
  levels: number
  cellX: number
  cellZ: number
}

export const DEFAULT_WAREHOUSE_LAYOUT_SPEC: WarehouseLayoutSpec =
  FLOOR_PLAN_LAYOUT_SPEC

export type WarehouseGeometry = {
  spec: WarehouseLayoutSpec
  rackRows: number
  pairs: number
  cellsLength: number
  cellsDepth: number
  levels: number
  rackLength: number
  rackDepth: number
  blockWidth: number
  totalZ: number
  floorMargin: number
  floorWidth: number
  floorDepth: number
  dockStagingDepth: number
  storageZOffset: number
  /** План симулятора устройств (8 back-to-back блоков, 16 стеллажей, 104×64 м). */
  floorPlanMode: boolean
  cellSize: number
  cellGap: number
  levelHeight: number
  /** Высота и глубина бокса ячейки (для floor plan ≠ cellSize). */
  cellHeight: number
  cellDepth: number
  getRowZ: (rowIndex: number) => number
  /** Центр стеллажа по X (для floor plan — смещение группы Rack). */
  getRackBaseX: (rowIndex: number) => number
  cellKey: (rackIndex: number, level: number, ix: number, iz: number) => string
  getCellWorldPosition: (
    row: number,
    level: number,
    cellX: number,
    cellZ: number,
  ) => [number, number, number]
}

function buildLegacyWarehouseGeometry(
  spec: WarehouseLayoutSpec,
): WarehouseGeometry {
  const rackRows = spec.rows
  const pairs = Math.max(1, Math.floor(rackRows / 2))
  const cellsLength = spec.cellX
  const cellsDepth = spec.cellZ
  const levels = spec.levels

  const rackLength = cellsLength * (CELL_SIZE + CELL_GAP) - CELL_GAP
  const rackDepth = cellsDepth * (CELL_SIZE + CELL_GAP) - CELL_GAP
  const blockWidth = 2 * rackDepth
  const totalZ = pairs * blockWidth + (pairs - 1) * PASSAGE_WIDTH
  const floorMargin = 3
  const floorWidth = rackLength + floorMargin * 2
  const dockStagingDepth = DOCK_STAGING_DEPTH
  const floorDepth = totalZ + floorMargin * 2 + dockStagingDepth
  const storageZOffset = -dockStagingDepth / 2

  function getRowZ(rowIndex: number): number {
    const pair = Math.floor(rowIndex / 2)
    const inPair = rowIndex % 2
    const blockStart = -totalZ / 2 + pair * (blockWidth + PASSAGE_WIDTH)
    return blockStart + rackDepth / 2 + inPair * rackDepth + storageZOffset
  }

  function getRackBaseX(_rowIndex: number): number {
    return 0
  }

  function cellKey(
    rackIndex: number,
    level: number,
    ix: number,
    iz: number,
  ): string {
    return `${rackIndex}-${level}-${ix}-${iz}`
  }

  function getCellWorldPosition(
    row: number,
    level: number,
    cellX: number,
    cellZ: number,
  ): [number, number, number] {
    const baseZ = getRowZ(row)
    const ox = (cellX - (cellsLength - 1) / 2) * (CELL_SIZE + CELL_GAP)
    const oy = level * LEVEL_HEIGHT + CELL_SIZE / 2 + 0.02
    const oz = (cellZ - (cellsDepth - 1) / 2) * (CELL_SIZE + CELL_GAP)
    return [ox, oy, baseZ + oz]
  }

  return {
    spec,
    rackRows,
    pairs,
    cellsLength,
    cellsDepth,
    levels,
    rackLength,
    rackDepth,
    blockWidth,
    totalZ,
    floorMargin,
    floorWidth,
    floorDepth,
    dockStagingDepth,
    storageZOffset,
    floorPlanMode: false,
    cellSize: CELL_SIZE,
    cellGap: CELL_GAP,
    levelHeight: LEVEL_HEIGHT,
    cellHeight: CELL_SIZE,
    cellDepth: CELL_SIZE,
    getRowZ,
    getRackBaseX,
    cellKey,
    getCellWorldPosition,
  }
}

function buildFloorPlanWarehouseGeometry(
  spec: WarehouseLayoutSpec,
): WarehouseGeometry {
  const racks = getFloorPlanRacks()
  const rackRows = racks.length
  const cellsLength = spec.cellX
  const cellsDepth = spec.cellZ
  const levels = spec.levels
  const rackLength = racks[0]?.w ?? 20
  const bayWidth = rackLength / Math.max(1, cellsLength)
  const rackDepth = racks[0]?.d ?? 3
  const pairs = Math.max(1, Math.floor(rackRows / 2))
  const blockWidth = rackDepth
  const totalZ = WAREHOUSE_DEPTH
  const floorMargin = 6
  const yardExtra = 12
  const floorWidth = WAREHOUSE_WIDTH + yardExtra * 2
  const floorDepth = WAREHOUSE_DEPTH + floorMargin * 2
  const dockStagingDepth = yardExtra

  function getRowZ(rowIndex: number): number {
    const rack = racks[rowIndex]
    if (!rack) return 0
    return planToWorldZ(rack.z + rack.d / 2)
  }

  function getRackBaseX(rowIndex: number): number {
    const rack = racks[rowIndex]
    if (!rack) return 0
    return planToWorldX(rack.x + rack.w / 2)
  }

  function cellKey(
    rackIndex: number,
    level: number,
    ix: number,
    iz: number,
  ): string {
    return `${rackIndex}-${level}-${ix}-${iz}`
  }

  function getCellWorldPosition(
    row: number,
    level: number,
    cellX: number,
    cellZ: number,
  ): [number, number, number] {
    const rack = racks[row]
    if (!rack) return [0, 0, 0]
    const bayWidth = rack.w / rack.bays
    const planX = rack.x + (cellX + 0.5) * bayWidth
    const faceSign = rack.side === "B" ? 1 : -1
    const inset = Math.max(0.12, (rack.d - FLOOR_PLAN_CELL_DEPTH) / 2)
    const planZ = rack.z + rack.d / 2 + faceSign * inset
    const oy =
      level * FLOOR_PLAN_LEVEL_HEIGHT + FLOOR_PLAN_CELL_HEIGHT / 2 + 0.02
    const oz =
      (cellZ - (cellsDepth - 1) / 2) *
      (FLOOR_PLAN_CELL_DEPTH + FLOOR_PLAN_CELL_GAP)
    return [planToWorldX(planX), oy, planToWorldZ(planZ) + oz]
  }

  return {
    spec,
    rackRows,
    pairs,
    cellsLength,
    cellsDepth,
    levels,
    rackLength,
    rackDepth,
    blockWidth,
    totalZ,
    floorMargin,
    floorWidth,
    floorDepth,
    dockStagingDepth,
    storageZOffset: 0,
    floorPlanMode: true,
    cellSize: bayWidth,
    cellGap: FLOOR_PLAN_CELL_GAP,
    levelHeight: FLOOR_PLAN_LEVEL_HEIGHT,
    cellHeight: FLOOR_PLAN_CELL_HEIGHT,
    cellDepth: FLOOR_PLAN_CELL_DEPTH,
    getRowZ,
    getRackBaseX,
    cellKey,
    getCellWorldPosition,
  }
}

export function buildWarehouseGeometry(
  spec: WarehouseLayoutSpec,
): WarehouseGeometry {
  if (isFloorPlanLayoutSpec(spec)) {
    return buildFloorPlanWarehouseGeometry(spec)
  }
  return buildLegacyWarehouseGeometry(spec)
}

const GeometryContext = createContext<WarehouseGeometry>(
  buildWarehouseGeometry(DEFAULT_WAREHOUSE_LAYOUT_SPEC),
)

export function WarehouseGeometryProvider({
  spec,
  children,
}: {
  spec?: WarehouseLayoutSpec | null
  children: ReactNode
}) {
  const geom = useMemo(
    () =>
      buildWarehouseGeometry(spec ?? DEFAULT_WAREHOUSE_LAYOUT_SPEC),
    [spec],
  )
  return (
    <GeometryContext.Provider value={geom}>{children}</GeometryContext.Provider>
  )
}

export function useWarehouseGeometry(): WarehouseGeometry {
  return useContext(GeometryContext)
}

/** Точка на полу под ячейкой (для маршрутов и симуляции техники). */
export function cellWorldOnFloor(
  geom: WarehouseGeometry,
  row: number,
  level: number,
  cellX: number,
  cellZ: number,
  floorY = 0.22,
): [number, number, number] {
  const [x, , z] = geom.getCellWorldPosition(row, level, cellX, cellZ)
  return [x, floorY, z]
}

export {
  CELL_GAP,
  CELL_SIZE,
  FLOOR_PLAN_BAY_WIDTH,
  FLOOR_PLAN_LEVEL_HEIGHT,
  LEVEL_HEIGHT,
  PASSAGE_WIDTH,
}

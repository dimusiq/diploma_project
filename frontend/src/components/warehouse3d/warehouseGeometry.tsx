/**
 * Геометрия склада для 3D: вычисляется из spec API (или дефолт совпадает с legacy константами).
 */
import { createContext, type ReactNode, useContext, useMemo } from "react"

const CELL_SIZE = 0.72
const CELL_GAP = 0.12
const LEVEL_HEIGHT = 0.82
const PASSAGE_WIDTH = 2.5

export type WarehouseLayoutSpec = {
  rows: number
  levels: number
  cellX: number
  cellZ: number
}

export const DEFAULT_WAREHOUSE_LAYOUT_SPEC: WarehouseLayoutSpec = {
  rows: 12,
  levels: 4,
  cellX: 20,
  cellZ: 1,
}

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
  getRowZ: (rowIndex: number) => number
  cellKey: (rackIndex: number, level: number, ix: number, iz: number) => string
  getCellWorldPosition: (
    row: number,
    level: number,
    cellX: number,
    cellZ: number,
  ) => [number, number, number]
}

export function buildWarehouseGeometry(
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
  const floorDepth = totalZ + floorMargin * 2

  function getRowZ(rowIndex: number): number {
    const pair = Math.floor(rowIndex / 2)
    const inPair = rowIndex % 2
    const blockStart = -totalZ / 2 + pair * (blockWidth + PASSAGE_WIDTH)
    return blockStart + rackDepth / 2 + inPair * rackDepth
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
    getRowZ,
    cellKey,
    getCellWorldPosition,
  }
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
    () => buildWarehouseGeometry(spec ?? DEFAULT_WAREHOUSE_LAYOUT_SPEC),
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

export { CELL_SIZE, CELL_GAP, LEVEL_HEIGHT, PASSAGE_WIDTH }

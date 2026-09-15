/**
 * Стеллаж в режиме плана «Сервера устройств»: полоса 48×3 м, 12 ячеек × 3 уровня.
 */
import { Text } from "@react-three/drei"
import { useMemo } from "react"
import { getFloorPlanRacks } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import { StorageCell } from "@/components/warehouse3d/WarehouseStorageCell.tsx"
import { cellMatchesFilter } from "@/components/warehouse3d/warehouse3dSearch.ts"
import type { CellStripe } from "@/components/warehouse3d/twin3dDerived.ts"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import { useWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

function isCellFilled(
  geom: ReturnType<typeof useWarehouseGeometry>,
  rackIndex: number,
  level: number,
  ix: number,
  iz: number,
  occupiedCellKeys?: Set<string> | null,
): boolean {
  if (!occupiedCellKeys?.size) return false
  return occupiedCellKeys.has(
    geom.cellKey(rackIndex, level, ix, iz),
  )
}

export function FloorPlanRackRow({
  rackIndex,
  baseX,
  baseZ,
  selectedCell,
  darkMode,
  onCellClick,
  onCellEnter,
  onCellLeave,
  occupiedCellKeys,
  expiringCellKeys,
  expiredCellKeys,
  heatByCellKey,
  hazardByCellKey,
  routeMode,
  onRouteWaypointAdd,
  cellFilter,
  fillRatio = 0,
}: {
  rackIndex: number
  baseX: number
  baseZ: number
  selectedCell: CellInfo | null
  darkMode?: boolean
  onCellClick: (info: CellInfo | null) => void
  onCellEnter?: (info: CellInfo) => void
  onCellLeave?: (info: CellInfo) => void
  occupiedCellKeys?: Set<string> | null
  expiringCellKeys?: Set<string> | null
  expiredCellKeys?: Set<string> | null
  heatByCellKey?: Map<string, number> | null
  hazardByCellKey?: Map<string, CellStripe> | null
  routeMode?: boolean
  onRouteWaypointAdd?: (info: CellInfo) => void
  cellFilter?: string
  fillRatio?: number
}) {
  const geom = useWarehouseGeometry()
  const rack = getFloorPlanRacks()[rackIndex]
  const rackH = geom.levels * geom.levelHeight

  const cells = useMemo(() => {
    const out: Array<{
      level: number
      ix: number
      iz: number
      filled: boolean
      expiring: boolean
      expired: boolean
    }> = []
    for (let level = 0; level < geom.levels; level++) {
      for (let ix = 0; ix < geom.cellsLength; ix++) {
        for (let iz = 0; iz < geom.cellsDepth; iz++) {
          const key = geom.cellKey(rackIndex, level, ix, iz)
          out.push({
            level,
            ix,
            iz,
            filled: isCellFilled(
              geom,
              rackIndex,
              level,
              ix,
              iz,
              occupiedCellKeys,
            ),
            expiring: Boolean(expiringCellKeys?.has(key)),
            expired: Boolean(expiredCellKeys?.has(key)),
          })
        }
      }
    }
    return out
  }, [
    geom,
    rackIndex,
    occupiedCellKeys,
    expiringCellKeys,
    expiredCellKeys,
  ])

  if (!rack) return null

  const shelfColor = darkMode ? "#475569" : "#94a3b8"
  const fillOpacity = 0.12 + fillRatio * 0.45

  return (
    <group position={[baseX, 0, baseZ]}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[geom.rackLength, 0.12, geom.rackDepth]} />
        <meshStandardMaterial
          color={shelfColor}
          transparent
          opacity={fillOpacity}
          metalness={0.15}
          roughness={0.75}
        />
      </mesh>
      <mesh position={[0, rackH / 2, 0]}>
        <boxGeometry
          args={[geom.rackLength + 0.04, rackH, geom.rackDepth]}
        />
        <meshStandardMaterial
          color={shelfColor}
          transparent
          opacity={0.06}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <Text
        position={[-geom.rackLength / 2 - 1.2, 0.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.9}
        color={darkMode ? "#cbd5e1" : "#475569"}
        anchorX="right"
        anchorY="middle"
      >
        {rack.code}
      </Text>
      <Text
        position={[geom.rackLength / 2 + 1.2, 0.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.75}
        color={darkMode ? "#94a3b8" : "#64748b"}
        anchorX="left"
        anchorY="middle"
      >
        {`${Math.round(fillRatio * 100)}%`}
      </Text>

      {cells.map(({ level, ix, iz, filled, expiring, expired }) => {
        const [wx, wy, wz] = geom.getCellWorldPosition(
          rackIndex,
          level,
          ix,
          iz,
        )
        const isSelected =
          selectedCell?.row === rackIndex &&
          selectedCell?.level === level &&
          selectedCell?.cellX === ix &&
          selectedCell?.cellZ === iz
        const info: CellInfo = {
          row: rackIndex,
          level,
          cellX: ix,
          cellZ: iz,
          filled,
        }
        const ckey = geom.cellKey(rackIndex, level, ix, iz)
        const matches = cellMatchesFilter(
          cellFilter,
          filled,
          expiring,
          expired,
        )
        if (
          !matches &&
          cellFilter &&
          cellFilter !== "all" &&
          !isSelected
        ) {
          return null
        }
        return (
          <StorageCell
            key={ckey}
            filled={filled}
            expiring={expiring}
            expired={expired}
            x={wx - baseX}
            y={wy}
            z={wz - baseZ}
            cellSize={geom.cellSize * 0.92}
            cellHeight={geom.cellHeight}
            cellDepth={geom.cellDepth * 0.92}
            selected={isSelected}
            darkMode={darkMode}
            heatIntensity={heatByCellKey?.get(ckey)}
            hazardStripe={hazardByCellKey?.get(ckey) ?? null}
            dimmed={!matches}
            onCellClick={(shiftKey) => {
              if (routeMode) {
                onRouteWaypointAdd?.(info)
                return
              }
              if (shiftKey && onRouteWaypointAdd) {
                onRouteWaypointAdd(info)
                return
              }
              onCellClick(isSelected ? null : info)
            }}
            onEnter={() => onCellEnter?.(info)}
            onLeave={() => onCellLeave?.(info)}
          />
        )
      })}
    </group>
  )
}

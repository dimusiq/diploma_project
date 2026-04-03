/**
 * Warehouse digital twin: ряды / уровни / ячейки из layout API (дефолт = legacy 12×4×20×1).
 */

import {
  Html,
  Line,
  OrbitControls,
  Text,
  useCursor,
  useProgress,
} from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Group, MeshStandardMaterial } from "three"
import { Vector3 } from "three"
import type { EquipmentPublic } from "@/api/equipment.ts"
import type { RouteGraphResponse } from "@/api/warehouseRouteGraph.ts"
import type { TopologyDocument } from "@/api/warehouseTopology.ts"
import { Button } from "@/components/ui/button.tsx"
import type { CellStripe } from "@/components/warehouse3d/twin3dDerived.ts"
import {
  type WarehouseEquipmentKind,
  WarehouseEquipmentMesh,
} from "@/components/warehouse3d/WarehouseEquipmentModels.tsx"
import {
  type TwinLayersVisibility,
  WarehouseTwinLayers,
} from "@/components/warehouse3d/WarehouseTwinLayers.tsx"
import { buildAisleRoutePolyline } from "@/components/warehouse3d/warehouseAisleRouting.ts"
import {
  buildWarehouseGeometry,
  CELL_GAP,
  CELL_SIZE,
  cellWorldOnFloor,
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
  LEVEL_HEIGHT,
  useWarehouseGeometry,
  type WarehouseGeometry,
  WarehouseGeometryProvider,
  type WarehouseLayoutSpec,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import {
  polylineLength,
  samplePolyline3D,
} from "@/components/warehouse3d/warehousePathFollow.ts"

export type { WarehouseEquipmentKind }
export type WarehouseInteractionMode = "view" | "route"

export type { WarehouseLayoutSpec }

const FLOOR_COLOR_LIGHT = "#6b7280"
const FLOOR_COLOR_DARK = "#374151"
const RACK_FRAME_COLOR_LIGHT = "#4b5563"
const RACK_FRAME_COLOR_DARK = "#1f2937"
const CELL_EMPTY_COLOR_LIGHT = "#9ca3af"
const CELL_EMPTY_COLOR_DARK = "#4b5563"
const CELL_FILLED_COLOR = "#3b82f6"
const CELL_HOVER_COLOR = "#93c5fd"
const CELL_SELECTED_COLOR = "#fbbf24"
const CELL_EXPIRING_COLOR = "#dc2626"
const CELL_EXPIRED_COLOR = "#7f1d1d"
const CELL_BLOCKED_COLOR = "#a855f7"
const CELL_RESERVED_COLOR = "#f59e0b"
const CELL_QUARANTINE_COLOR = "#7c3aed"
const FLOOR_LABEL_COLOR_LIGHT = "#e5e7eb"
const FLOOR_LABEL_COLOR_DARK = "#6b7280"

function isCellFilled(
  geom: WarehouseGeometry,
  rackIndex: number,
  level: number,
  ix: number,
  iz: number,
  occupiedCellKeys?: Set<string> | null,
): boolean {
  return Boolean(occupiedCellKeys?.has(geom.cellKey(rackIndex, level, ix, iz)))
}

export interface CellInfo {
  row: number
  level: number
  cellX: number
  cellZ: number
  filled: boolean
}

/** Мировые координаты центра ячейки (дефолтная геометрия; внутри Canvas используйте geom из контекста). */
export function getCellWorldPosition(
  row: number,
  level: number,
  cellX: number,
  cellZ: number,
): [number, number, number] {
  return buildWarehouseGeometry(
    DEFAULT_WAREHOUSE_LAYOUT_SPEC,
  ).getCellWorldPosition(row, level, cellX, cellZ)
}

export interface CellItemInfo {
  id?: string
  title: string
  description?: string | null
  quantity?: number
  unit?: string | null
  sku?: string | null
  expires_at?: string | null
  location?: string | null
  status: string
  expiringSoon?: boolean
  isExpired?: boolean
  expiredDays?: number
}

function StorageCell({
  filled,
  expiring,
  expired,
  x,
  y,
  z,
  selected,
  darkMode,
  heatIntensity,
  hazardStripe,
  onCellClick,
  onEnter,
  onLeave,
}: {
  filled: boolean
  expiring: boolean
  expired: boolean
  x: number
  y: number
  z: number
  selected?: boolean
  darkMode?: boolean
  /** 0…1 — heatmap (congestion / pick / SLA / replenishment). */
  heatIntensity?: number
  hazardStripe?: CellStripe | null
  onCellClick?: (shiftKey: boolean) => void
  onEnter?: () => void
  onLeave?: () => void
}) {
  const [hover, setHover] = useState(false)
  const materialRef = useRef<MeshStandardMaterial>(null)
  useCursor(hover, "pointer", "auto")

  useFrame((state) => {
    const mat = materialRef.current
    if (!mat) return
    if (expired) {
      const t = state.clock.elapsedTime
      mat.color.setStyle(CELL_EXPIRED_COLOR)
      mat.emissive.setStyle(CELL_EXPIRED_COLOR)
      mat.emissiveIntensity = 0.15 + 0.3 * Math.sin(t * 4)
      return
    }
    if (expiring) {
      const t = state.clock.elapsedTime
      mat.color.setStyle(CELL_EXPIRING_COLOR)
      mat.emissive.setStyle(CELL_EXPIRING_COLOR)
      mat.emissiveIntensity = 0.2 + 0.35 * Math.sin(t * 4)
      return
    }
    if (hazardStripe === "blocked") {
      mat.color.setStyle(CELL_BLOCKED_COLOR)
      mat.emissive.setStyle(CELL_BLOCKED_COLOR)
      mat.emissiveIntensity = 0.12
      return
    }
    if (hazardStripe === "reserved") {
      mat.color.setStyle(CELL_RESERVED_COLOR)
      mat.emissive.setStyle("#b45309")
      mat.emissiveIntensity = 0.12
      return
    }
    if (hazardStripe === "quarantine") {
      mat.color.setStyle(CELL_QUARANTINE_COLOR)
      mat.emissive.setStyle(CELL_QUARANTINE_COLOR)
      mat.emissiveIntensity = 0.15
      return
    }
    const hi = heatIntensity ?? 0
    if (hi > 0.02) {
      const r = 0.55 + hi * 0.42
      const g = 0.55 - hi * 0.35
      const b = 0.65 - hi * 0.45
      mat.color.setRGB(r, Math.max(0.2, g), Math.max(0.15, b))
      mat.emissive.setRGB(r * 0.4, g * 0.2, 0.05)
      mat.emissiveIntensity = 0.08 + hi * 0.22
      return
    }
    mat.emissiveIntensity = 0
    mat.emissive.setStyle("#000000")
    if (selected) {
      mat.color.setStyle(CELL_SELECTED_COLOR)
      mat.emissive.setStyle("#b45309")
      mat.emissiveIntensity = 0.15
    } else if (hover) {
      mat.color.setStyle(CELL_HOVER_COLOR)
    } else if (filled) {
      mat.color.setStyle(CELL_FILLED_COLOR)
    } else {
      mat.color.setStyle(
        darkMode ? CELL_EMPTY_COLOR_DARK : CELL_EMPTY_COLOR_LIGHT,
      )
    }
  })

  const baseColor = expired
    ? CELL_EXPIRED_COLOR
    : expiring
      ? CELL_EXPIRING_COLOR
      : hazardStripe === "blocked"
        ? CELL_BLOCKED_COLOR
        : hazardStripe === "reserved"
          ? CELL_RESERVED_COLOR
          : hazardStripe === "quarantine"
            ? CELL_QUARANTINE_COLOR
            : (heatIntensity ?? 0) > 0.02
              ? `rgb(${Math.round(55 + (heatIntensity ?? 0) * 200)}, ${Math.round(140 - (heatIntensity ?? 0) * 90)}, ${Math.round(165 - (heatIntensity ?? 0) * 120)})`
              : selected
                ? CELL_SELECTED_COLOR
                : hover
                  ? CELL_HOVER_COLOR
                  : filled
                    ? CELL_FILLED_COLOR
                    : darkMode
                      ? CELL_EMPTY_COLOR_DARK
                      : CELL_EMPTY_COLOR_LIGHT

  return (
    <mesh
      position={[x, y, z]}
      onClick={(e) => {
        e.stopPropagation()
        onCellClick?.(e.shiftKey)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        onEnter?.()
      }}
      onPointerOut={() => {
        setHover(false)
        onLeave?.()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <boxGeometry args={[CELL_SIZE, CELL_SIZE, CELL_SIZE]} />
      <meshStandardMaterial
        ref={materialRef}
        color={baseColor}
        metalness={0.1}
        roughness={0.7}
      />
    </mesh>
  )
}

function Rack({
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
}) {
  const geom = useWarehouseGeometry()
  const rackFrameColor = darkMode
    ? RACK_FRAME_COLOR_DARK
    : RACK_FRAME_COLOR_LIGHT
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
  }, [geom, rackIndex, occupiedCellKeys, expiringCellKeys, expiredCellKeys])

  const rackH = geom.levels * LEVEL_HEIGHT

  return (
    <group position={[baseX, 0, baseZ]}>
      {[
        [-geom.rackLength / 2 - 0.04, rackH / 2, -geom.rackDepth / 2 - 0.04],
        [geom.rackLength / 2 + 0.04, rackH / 2, -geom.rackDepth / 2 - 0.04],
        [-geom.rackLength / 2 - 0.04, rackH / 2, geom.rackDepth / 2 + 0.04],
        [geom.rackLength / 2 + 0.04, rackH / 2, geom.rackDepth / 2 + 0.04],
      ].map(([px, py, pz], i) => (
        <mesh key={i} position={[px, py, pz]}>
          <boxGeometry args={[0.08, rackH, 0.08]} />
          <meshStandardMaterial
            color={rackFrameColor}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
      ))}
      {cells.map(({ level, ix, iz, filled, expiring, expired }, i) => {
        const ox = (ix - (geom.cellsLength - 1) / 2) * (CELL_SIZE + CELL_GAP)
        const oz = (iz - (geom.cellsDepth - 1) / 2) * (CELL_SIZE + CELL_GAP)
        const oy = level * LEVEL_HEIGHT + CELL_SIZE / 2 + 0.02
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
        return (
          <StorageCell
            key={i}
            filled={filled}
            expiring={expiring}
            expired={expired}
            x={ox}
            y={oy}
            z={oz}
            selected={isSelected}
            darkMode={darkMode}
            heatIntensity={heatByCellKey?.get(ckey)}
            hazardStripe={hazardByCellKey?.get(ckey) ?? null}
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

function Floor({ darkMode }: { darkMode?: boolean }) {
  const geom = useWarehouseGeometry()
  const color = darkMode ? FLOOR_COLOR_DARK : FLOOR_COLOR_LIGHT
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[geom.floorWidth, geom.floorDepth]} />
      <meshStandardMaterial color={color} metalness={0.05} roughness={0.9} />
    </mesh>
  )
}

function CellPopup({
  position,
  cellLabel,
  item,
  onClose,
}: {
  position: [number, number, number]
  cellLabel: string
  item: CellItemInfo | null
  onClose: () => void
}) {
  // Для нижних уровней поднимаем попап выше ячейки, чтобы не обрезался по краю экрана
  const cellY = position[1]
  const liftY = cellY < 1.4 ? 1.1 : 0
  const offsetPosition: [number, number, number] = [
    position[0] + 1.2,
    cellY + liftY,
    position[2],
  ]
  return (
    <Html position={offsetPosition} center style={{ pointerEvents: "auto" }}>
      <div
        className="cell-popup"
        style={{
          minWidth: "220px",
          maxWidth: "320px",
          padding: "12px 14px",
          background: "white",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          fontFamily: "system-ui, sans-serif",
          fontSize: "13px",
          color: "#1a1a1a",
          border: "1px solid #e2e8f0",
          animation: "cellPopupIn 0.18s ease-out",
        }}
      >
        <style>{`
          @keyframes cellPopupIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: "14px" }}>
          {cellLabel}
        </div>
        {item ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
            {item.description && (
              <div
                style={{ color: "#64748b", marginBottom: 6, fontSize: "12px" }}
              >
                {item.description}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 4,
              }}
            >
              <span>Кол-во: {item.quantity ?? 1}</span>
              {item.unit && <span>Ед.: {item.unit}</span>}
              {item.sku && <span>Артикул: {item.sku}</span>}
            </div>
            {item.expires_at && (
              <div style={{ marginBottom: 4 }}>
                Срок годности:{" "}
                {new Date(item.expires_at).toLocaleDateString("ru-RU")}
                {item.isExpired && item.expiredDays != null && (
                  <span
                    style={{ marginLeft: 6, color: "#7f1d1d", fontWeight: 600 }}
                  >
                    Просрочено на {item.expiredDays}{" "}
                    {item.expiredDays === 1
                      ? "день"
                      : item.expiredDays < 5
                        ? "дня"
                        : "дней"}
                  </span>
                )}
                {item.expiringSoon && !item.isExpired && (
                  <span
                    style={{ marginLeft: 6, color: "#dc2626", fontWeight: 600 }}
                  >
                    Скоро истекает
                  </span>
                )}
              </div>
            )}
            {item.location && (
              <div style={{ color: "#64748b", fontSize: "12px" }}>
                Место: {item.location}
              </div>
            )}
            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: 6 }}>
              Статус: {item.status}
            </div>
            {item.id && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs"
              >
                <a
                  href={`/items?open=${encodeURIComponent(item.id)}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Подробнее →
                </a>
              </Button>
            )}
          </>
        ) : (
          <div style={{ color: "#64748b" }}>Ячейка свободна</div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2.5 h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          Закрыть
        </Button>
      </div>
    </Html>
  )
}

function FloorMarkings({
  rowPositions,
  darkMode,
}: {
  rowPositions: Array<{ rowIndex: number; z: number }>
  darkMode?: boolean
}) {
  const geom = useWarehouseGeometry()
  const labelX = -geom.rackLength / 2 - 0.6
  const labelColor = darkMode ? FLOOR_LABEL_COLOR_DARK : FLOOR_LABEL_COLOR_LIGHT
  return (
    <group>
      {rowPositions.map(({ rowIndex, z }) => (
        <Text
          key={rowIndex}
          position={[labelX, 0.02, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.7}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
          maxWidth={1.5}
        >
          {String(rowIndex)}
        </Text>
      ))}
    </group>
  )
}

function HoverLabel({ cell }: { cell: CellInfo }) {
  const geom = useWarehouseGeometry()
  const position = geom.getCellWorldPosition(
    cell.row,
    cell.level,
    cell.cellX,
    cell.cellZ,
  )
  const labelPosition: [number, number, number] = [
    position[0],
    position[1] + 0.55,
    position[2],
  ]
  return (
    <Html position={labelPosition} center style={{ pointerEvents: "none" }}>
      <div
        style={{
          padding: "4px 8px",
          background: "rgba(0,0,0,0.75)",
          color: "white",
          fontSize: "11px",
          borderRadius: "4px",
          whiteSpace: "nowrap",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Ряд {cell.row + 1}, уровень {cell.level + 1}
      </div>
    </Html>
  )
}

const ROUTE_LINE_COLOR = "#ea580c"
const ROUTE_FLOOR_Y = 0.22

function RoutePathLayer({
  pathPoints,
  cellWaypoints,
}: {
  pathPoints: Vector3[]
  cellWaypoints: CellInfo[]
}) {
  const geom = useWarehouseGeometry()
  const cellMarkers = useMemo(() => {
    return cellWaypoints.map(
      (w) =>
        new Vector3(
          ...cellWorldOnFloor(geom, w.row, w.level, w.cellX, w.cellZ),
        ),
    )
  }, [geom, cellWaypoints])
  if (cellWaypoints.length === 0) return null
  return (
    <group>
      {cellMarkers.map((p, i) => (
        <mesh key={i} position={[p.x, p.y + 0.04, p.z]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial
            color="#fb923c"
            emissive="#c2410c"
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}
      {pathPoints.length >= 2 && (
        <Line points={pathPoints} color={ROUTE_LINE_COLOR} lineWidth={2.5} />
      )}
    </group>
  )
}

function SimulationEquipmentAlongRoute({
  pathPoints,
  active,
  speed,
  equipmentKind,
  showCargo,
  onComplete,
}: {
  pathPoints: Vector3[]
  active: boolean
  speed: number
  equipmentKind: WarehouseEquipmentKind
  showCargo: boolean
  onComplete?: () => void
}) {
  const groupRef = useRef<Group>(null)
  const tRef = useRef(0)
  const doneRef = useRef(false)
  const lengthRef = useRef(1)

  useEffect(() => {
    lengthRef.current = Math.max(polylineLength(pathPoints), 0.05)
  }, [pathPoints])

  useEffect(() => {
    if (active) {
      tRef.current = 0
      doneRef.current = false
    }
  }, [active])

  useFrame((state, delta) => {
    if (!active || pathPoints.length < 2 || !groupRef.current) return
    const len = lengthRef.current
    tRef.current += (speed * delta) / len
    state.invalidate()
    if (tRef.current >= 1) {
      tRef.current = 1
      if (!doneRef.current) {
        doneRef.current = true
        onComplete?.()
      }
    }
    const { position, headingY } = samplePolyline3D(pathPoints, tRef.current)
    groupRef.current.position.copy(position)
    groupRef.current.rotation.set(0, headingY, 0)
  })

  if (pathPoints.length < 2) return null
  return (
    <group ref={groupRef}>
      <WarehouseEquipmentMesh
        kind={equipmentKind}
        showPallet={showCargo && equipmentKind === "forklift"}
      />
    </group>
  )
}

export type TwinOverlayMode =
  | "standard"
  | "occupancy"
  | "workload"
  | "replenishment_need"
  | "anomaly_alerts"
  | "maintenance_safety"

export type WarehouseTwinEnrichment = {
  overlayMode: TwinOverlayMode
  topology: TopologyDocument | null
  routeGraph: RouteGraphResponse | null
  equipmentList: EquipmentPublic[]
  twinHeatByCellKey: Map<string, number>
  twinHazardByCellKey: Map<string, CellStripe>
  twinLayerVisibility: TwinLayersVisibility
}

function WarehouseContent({
  selectedCell,
  onCellSelect,
  occupiedCellKeys,
  expiringCellKeys,
  expiredCellKeys,
  selectedItem,
  darkMode,
  interactionMode = "view",
  routeWaypoints = [],
  onRouteWaypointAdd,
  simulationActive = false,
  simulationEquipment = "forklift",
  simulationSpeed = 1.25,
  simulationShowCargo = true,
  onSimulationComplete,
  twinEnrichment,
}: {
  selectedCell: CellInfo | null
  onCellSelect: (info: CellInfo | null) => void
  occupiedCellKeys?: Set<string> | null
  expiringCellKeys?: Set<string> | null
  expiredCellKeys?: Set<string> | null
  selectedItem?: CellItemInfo | null
  darkMode?: boolean
  interactionMode?: WarehouseInteractionMode
  routeWaypoints?: CellInfo[]
  onRouteWaypointAdd?: (cell: CellInfo) => void
  simulationActive?: boolean
  simulationEquipment?: WarehouseEquipmentKind
  simulationSpeed?: number
  simulationShowCargo?: boolean
  onSimulationComplete?: () => void
  twinEnrichment?: WarehouseTwinEnrichment | null
}) {
  const geom = useWarehouseGeometry()
  const [hoveredCell, setHoveredCell] = useState<CellInfo | null>(null)
  const handleCellEnter = useCallback(
    (cell: CellInfo) => setHoveredCell(cell),
    [],
  )
  const handleCellLeave = useCallback((cell: CellInfo) => {
    setHoveredCell((prev) =>
      prev &&
      prev.row === cell.row &&
      prev.level === cell.level &&
      prev.cellX === cell.cellX &&
      prev.cellZ === cell.cellZ
        ? null
        : prev,
    )
  }, [])

  const rackPositions = useMemo(() => {
    return Array.from({ length: geom.rackRows }, (_, row) => ({
      rackIndex: row,
      x: 0,
      z: geom.getRowZ(row),
    }))
  }, [geom])

  const rowPositions = useMemo(
    () =>
      rackPositions.map(({ rackIndex, z }) => ({
        rowIndex: rackIndex + 1,
        z,
      })),
    [rackPositions],
  )

  const aislePathPoints = useMemo(
    () => buildAisleRoutePolyline(geom, routeWaypoints, ROUTE_FLOOR_Y),
    [geom, routeWaypoints],
  )

  const routeClicksEnabled = interactionMode === "route" && !simulationActive

  return (
    <>
      <ambientLight intensity={0.85} />
      <pointLight
        position={[0, 6, 0]}
        intensity={1.5}
        distance={50}
        decay={2}
      />
      <pointLight
        position={[-8, 5, -6]}
        intensity={0.9}
        distance={35}
        decay={2}
      />
      <pointLight
        position={[8, 5, -6]}
        intensity={0.9}
        distance={35}
        decay={2}
      />
      <pointLight
        position={[-8, 5, 6]}
        intensity={0.9}
        distance={35}
        decay={2}
      />
      <pointLight
        position={[8, 5, 6]}
        intensity={0.9}
        distance={35}
        decay={2}
      />

      <Floor darkMode={darkMode} />
      <FloorMarkings rowPositions={rowPositions} darkMode={darkMode} />
      {twinEnrichment && (
        <WarehouseTwinLayers
          topology={twinEnrichment.topology}
          routeGraph={twinEnrichment.routeGraph}
          equipment={twinEnrichment.equipmentList}
          visibility={twinEnrichment.twinLayerVisibility}
        />
      )}
      {routeWaypoints.length > 0 && (
        <RoutePathLayer
          pathPoints={aislePathPoints}
          cellWaypoints={routeWaypoints}
        />
      )}
      <SimulationEquipmentAlongRoute
        pathPoints={aislePathPoints}
        active={simulationActive}
        speed={simulationSpeed}
        equipmentKind={simulationEquipment}
        showCargo={simulationShowCargo}
        onComplete={onSimulationComplete}
      />
      {hoveredCell && !selectedCell && <HoverLabel cell={hoveredCell} />}
      {selectedCell && (
        <CellPopup
          position={geom.getCellWorldPosition(
            selectedCell.row,
            selectedCell.level,
            selectedCell.cellX,
            selectedCell.cellZ,
          )}
          cellLabel={`Ячейка: ряд ${selectedCell.row + 1}, уровень ${selectedCell.level + 1}, позиция ${selectedCell.cellX + 1}`}
          item={selectedItem ?? null}
          onClose={() => onCellSelect(null)}
        />
      )}
      {rackPositions.map(({ rackIndex, x, z }) => (
        <Rack
          key={rackIndex}
          rackIndex={rackIndex}
          baseX={x}
          baseZ={z}
          selectedCell={selectedCell}
          darkMode={darkMode}
          onCellClick={onCellSelect}
          onCellEnter={handleCellEnter}
          onCellLeave={handleCellLeave}
          occupiedCellKeys={occupiedCellKeys}
          expiringCellKeys={expiringCellKeys}
          expiredCellKeys={expiredCellKeys}
          heatByCellKey={twinEnrichment?.twinHeatByCellKey}
          hazardByCellKey={twinEnrichment?.twinHazardByCellKey}
          routeMode={routeClicksEnabled}
          onRouteWaypointAdd={onRouteWaypointAdd}
        />
      ))}
    </>
  )
}

/** Фокус камеры только при переходе по «Показать на складе 3D» (focusCell), не при клике по ячейке. */
function CameraFocusOnCell({
  focusCell,
  onFocusDone,
}: {
  focusCell: CellInfo | null
  onFocusDone?: () => void
}) {
  const geom = useWarehouseGeometry()
  const appliedKeyRef = useRef<string | null>(null)
  const frameCountRef = useRef(0)

  useFrame((state) => {
    const { camera, controls, invalidate } = state
    const c = controls as unknown as
      | {
          target: { set: (x: number, y: number, z: number) => void }
          update?: () => void
        }
      | undefined

    if (!focusCell) {
      appliedKeyRef.current = null
      frameCountRef.current = 0
      return
    }

    const key = geom.cellKey(
      focusCell.row,
      focusCell.level,
      focusCell.cellX,
      focusCell.cellZ,
    )
    if (appliedKeyRef.current === key) return

    if (!c?.target?.set) return
    frameCountRef.current += 1
    if (frameCountRef.current < 2) return

    const [cx, cy, cz] = geom.getCellWorldPosition(
      focusCell.row,
      focusCell.level,
      focusCell.cellX,
      focusCell.cellZ,
    )
    const dist = 14
    c.target.set(cx, cy, cz)
    camera.position.set(cx, cy + 6, cz - dist)
    c.update?.()
    appliedKeyRef.current = key
    invalidate?.()
    onFocusDone?.()
  })
  return null
}

/** Индикатор загрузки сцены (Suspense / R3F 9). Показывается, пока активна загрузка ресурсов. */
function SceneLoadOverlay() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <Html fullscreen center>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          height: "100%",
          background: "rgba(255,255,255,0.85)",
          fontSize: 14,
          color: "#374151",
        }}
      >
        <span>Подготовка 3D сцены…</span>
        {progress > 0 && (
          <div
            style={{
              width: 120,
              height: 4,
              background: "#e5e7eb",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, progress)}%`,
                height: "100%",
                background: "#3b82f6",
                transition: "width 0.2s ease",
              }}
            />
          </div>
        )}
      </div>
    </Html>
  )
}

interface WarehouseSceneProps {
  /** Выбранная ячейка (показ попапа, подсветка). */
  selectedCell?: CellInfo | null
  /** Ячейка, на которую нужно один раз навести камеру (только при переходе по «Показать на складе 3D»). */
  focusCell?: CellInfo | null
  /** Вызывается после применения фокуса камеры на focusCell (чтобы страница сбросила focusCell). */
  onFocusDone?: () => void
  onCellSelect?: (info: CellInfo | null) => void
  occupiedCellKeys?: Set<string> | null
  expiringCellKeys?: Set<string> | null
  expiredCellKeys?: Set<string> | null
  selectedItem?: CellItemInfo | null
  darkMode?: boolean
  /** Spec из GET /api/v1/warehouse/layout (поля rows, levels, cellX, cellZ). */
  layoutSpec?: WarehouseLayoutSpec | null
  /** Просмотр ячеек или прокладка маршрута по клику. */
  interactionMode?: WarehouseInteractionMode
  /** Точки маршрута (порядок = порядок проезда). */
  routeWaypoints?: CellInfo[]
  /** В режиме маршрута: клик по ячейке добавляет точку. */
  onRouteWaypointAdd?: (cell: CellInfo) => void
  /** Анимация движения техники по `routeWaypoints`. */
  simulationActive?: boolean
  simulationEquipment?: WarehouseEquipmentKind
  /** Скорость в единицах сцены в секунду (масштаб ~ метры). */
  simulationSpeed?: number
  simulationShowCargo?: boolean
  onSimulationComplete?: () => void
  /** Зоны, проходы, граф маршрутов, heatmap по ячейкам — см. страницу 3D. */
  twinEnrichment?: WarehouseTwinEnrichment | null
}

export function WarehouseScene({
  selectedCell: selectedCellFromParent,
  focusCell,
  onFocusDone,
  onCellSelect,
  occupiedCellKeys,
  expiringCellKeys,
  expiredCellKeys,
  selectedItem,
  darkMode,
  layoutSpec,
  interactionMode = "view",
  routeWaypoints = [],
  onRouteWaypointAdd,
  simulationActive = false,
  simulationEquipment = "forklift",
  simulationSpeed = 1.25,
  simulationShowCargo = true,
  onSimulationComplete,
  twinEnrichment = null,
}: WarehouseSceneProps) {
  const [internalCell, setInternalCell] = useState<CellInfo | null>(null)
  const isControlled = selectedCellFromParent !== undefined
  const selectedCell = isControlled
    ? (selectedCellFromParent ?? null)
    : internalCell

  const handleCellSelect = useCallback(
    (info: CellInfo | null) => {
      if (!isControlled) setInternalCell(info)
      onCellSelect?.(info ?? null)
    },
    [onCellSelect, isControlled],
  )

  return (
    <Canvas
      camera={{
        position: [20, 16, 20],
        fov: 45,
        near: 0.1,
        far: 150,
      }}
      gl={{ antialias: true }}
      onPointerMissed={() => {
        if (interactionMode === "view") handleCellSelect(null)
      }}
    >
      <WarehouseGeometryProvider spec={layoutSpec}>
        <SceneLoadOverlay />
        <WarehouseContent
          selectedCell={selectedCell}
          onCellSelect={handleCellSelect}
          occupiedCellKeys={occupiedCellKeys}
          expiringCellKeys={expiringCellKeys}
          expiredCellKeys={expiredCellKeys}
          selectedItem={selectedItem}
          darkMode={darkMode}
          interactionMode={interactionMode}
          routeWaypoints={routeWaypoints}
          onRouteWaypointAdd={onRouteWaypointAdd}
          simulationActive={simulationActive}
          simulationEquipment={simulationEquipment}
          simulationSpeed={simulationSpeed}
          simulationShowCargo={simulationShowCargo}
          onSimulationComplete={onSimulationComplete}
          twinEnrichment={twinEnrichment}
        />
        <CameraFocusOnCell
          focusCell={focusCell ?? null}
          onFocusDone={onFocusDone}
        />
      </WarehouseGeometryProvider>
      <OrbitControls
        enablePan
        enableZoom
        minDistance={14}
        maxDistance={55}
        target={[0, 2, 0]}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />
    </Canvas>
  )
}

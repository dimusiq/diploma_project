/**
 * Warehouse digital twin: ряды / уровни / ячейки из layout API (дефолт = legacy 12×4×20×1).
 */

import {
  ContactShadows,
  Environment,
  Html,
  Line,
  OrbitControls,
  Text,
  useCursor,
  useProgress,
} from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Group } from "three"
import { Euler, MeshStandardMaterial, Vector3 } from "three"
import type { EquipmentPublic } from "@/api/equipment.ts"
import type { RouteGraphResponse } from "@/api/warehouseRouteGraph.ts"
import type { TopologyDocument } from "@/api/warehouseTopology.ts"
import { Button } from "@/components/ui/button.tsx"
import type { CellStripe } from "@/components/warehouse3d/twin3dDerived.ts"
import {
  ConveyorSection,
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

function RackColumnGuard({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.15, 0]} material={_sharedMaterials.guardYellow}>
        <cylinderGeometry args={[0.065, 0.075, 0.3, 6]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} material={_sharedMaterials.guardYellow}>
        <boxGeometry args={[0.16, 0.02, 0.16]} />
      </mesh>
      <mesh position={[0, 0.18, 0]} material={_sharedMaterials.guardBlack}>
        <cylinderGeometry args={[0.068, 0.068, 0.04, 6]} />
      </mesh>
    </group>
  )
}

function WireMeshDeck({
  width,
  depth,
  y,
}: {
  width: number
  depth: number
  y: number
}) {
  return (
    <group>
      <mesh position={[0, y, 0]} material={_sharedMaterials.deckGray}>
        <boxGeometry args={[width, 0.008, depth]} />
      </mesh>
      {[-width / 4, width / 4].map((x, i) => (
        <mesh key={i} position={[x, y - 0.006, 0]} material={_sharedMaterials.deckSupport}>
          <boxGeometry args={[0.015, 0.01, depth]} />
        </mesh>
      ))}
    </group>
  )
}

const _sharedMaterials = {
  beamOrange: new MeshStandardMaterial({ color: "#ea580c", metalness: 0.3, roughness: 0.5 }),
  clipRed: new MeshStandardMaterial({ color: "#b91c1c", metalness: 0.3, roughness: 0.5 }),
  guardYellow: new MeshStandardMaterial({ color: "#eab308", metalness: 0.2, roughness: 0.6 }),
  guardBlack: new MeshStandardMaterial({ color: "#1c1917", metalness: 0.1, roughness: 0.8 }),
  deckGray: new MeshStandardMaterial({ color: "#9ca3af", metalness: 0.55, roughness: 0.4, transparent: true, opacity: 0.55 }),
  deckSupport: new MeshStandardMaterial({ color: "#6b7280", metalness: 0.5, roughness: 0.45 }),
  labelBlue: new MeshStandardMaterial({ color: "#1d4ed8", metalness: 0.15, roughness: 0.6 }),
  perfDark: new MeshStandardMaterial({ color: "#374151", metalness: 0.3, roughness: 0.7 }),
  perfDarkDM: new MeshStandardMaterial({ color: "#0f172a", metalness: 0.3, roughness: 0.7 }),
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

  const intermediateUprightPositions = useMemo(() => {
    const positions: number[] = []
    const step = Math.max(3, Math.floor(geom.cellsLength / 5))
    for (let i = step; i < geom.cellsLength; i += step) {
      const x = (i - (geom.cellsLength - 1) / 2) * (CELL_SIZE + CELL_GAP)
      positions.push(x)
    }
    return positions
  }, [geom])

  return (
    <group position={[baseX, 0, baseZ]}>
      {/* Vertical uprights (corners) */}
      {[
        [-geom.rackLength / 2 - 0.04, rackH / 2, -geom.rackDepth / 2 - 0.04],
        [geom.rackLength / 2 + 0.04, rackH / 2, -geom.rackDepth / 2 - 0.04],
        [-geom.rackLength / 2 - 0.04, rackH / 2, geom.rackDepth / 2 + 0.04],
        [geom.rackLength / 2 + 0.04, rackH / 2, geom.rackDepth / 2 + 0.04],
      ].map(([px, py, pz], i) => (
        <group key={`upright-${i}`}>
          <mesh position={[px, py, pz]}>
            <boxGeometry args={[0.08, rackH, 0.08]} />
            <meshStandardMaterial
              color={rackFrameColor}
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
          <mesh position={[px, 0.01, pz]}>
            <boxGeometry args={[0.14, 0.02, 0.14]} />
            <meshStandardMaterial
              color={rackFrameColor}
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
          {/* Perforation marks (simplified — 1 per level) */}
          {Array.from({ length: geom.levels }, (_, hi) => (
            <mesh key={hi} position={[px, (hi + 0.5) * LEVEL_HEIGHT, pz]} material={darkMode ? _sharedMaterials.perfDarkDM : _sharedMaterials.perfDark}>
              <boxGeometry args={[0.09, 0.02, 0.03]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Intermediate uprights for long racks */}
      {intermediateUprightPositions.map((x, i) =>
        [-geom.rackDepth / 2 - 0.04, geom.rackDepth / 2 + 0.04].map(
          (z, zi) => (
            <mesh key={`int-up-${i}-${zi}`} position={[x, rackH / 2, z]}>
              <boxGeometry args={[0.06, rackH, 0.06]} />
              <meshStandardMaterial
                color={rackFrameColor}
                metalness={0.35}
                roughness={0.55}
              />
            </mesh>
          ),
        ),
      )}

      {/* Horizontal beams at each level (orange safety beams) */}
      {Array.from({ length: geom.levels + 1 }, (_, lvl) => {
        const beamY = lvl * LEVEL_HEIGHT
        return (
          <group key={`beam-level-${lvl}`}>
            <mesh
              position={[0, beamY + 0.01, -geom.rackDepth / 2 - 0.04]}
              material={_sharedMaterials.beamOrange}
            >
              <boxGeometry args={[geom.rackLength + 0.16, 0.05, 0.035]} />
            </mesh>
            <mesh
              position={[0, beamY + 0.01, geom.rackDepth / 2 + 0.04]}
              material={_sharedMaterials.beamOrange}
            >
              <boxGeometry args={[geom.rackLength + 0.16, 0.05, 0.035]} />
            </mesh>
            {[-geom.rackLength / 2 + 0.15, geom.rackLength / 2 - 0.15].map(
              (clipX, ci) => (
                <mesh
                  key={`clip-${lvl}-${ci}`}
                  position={[clipX, beamY + 0.035, -geom.rackDepth / 2 - 0.06]}
                  material={_sharedMaterials.clipRed}
                >
                  <boxGeometry args={[0.02, 0.02, 0.015]} />
                </mesh>
              ),
            )}
          </group>
        )
      })}

      {/* Wire mesh decking on each level */}
      {Array.from({ length: geom.levels }, (_, lvl) => (
        <WireMeshDeck
          key={`deck-${lvl}`}
          width={geom.rackLength}
          depth={geom.rackDepth}
          y={lvl * LEVEL_HEIGHT + 0.005}
        />
      ))}

      {/* Column guards (yellow bollards at rack corners) */}
      {[
        [-geom.rackLength / 2 - 0.18, 0, -geom.rackDepth / 2 - 0.18],
        [geom.rackLength / 2 + 0.18, 0, -geom.rackDepth / 2 - 0.18],
        [-geom.rackLength / 2 - 0.18, 0, geom.rackDepth / 2 + 0.18],
        [geom.rackLength / 2 + 0.18, 0, geom.rackDepth / 2 + 0.18],
      ].map(([gx, gy, gz], gi) => (
        <RackColumnGuard key={`guard-${gi}`} position={[gx, gy, gz]} />
      ))}

      {/* Rack end-cap labels (row number on each end) */}
      {[-geom.rackLength / 2 - 0.06, geom.rackLength / 2 + 0.06].map(
        (lx, li) => (
          <group key={`endcap-${li}`}>
            <mesh position={[lx, rackH - 0.15, 0]} material={_sharedMaterials.labelBlue}>
              <boxGeometry args={[0.01, 0.22, geom.rackDepth + 0.2]} />
            </mesh>
            <Text
              position={[
                lx + (li === 0 ? -0.02 : 0.02),
                rackH - 0.15,
                0,
              ]}
              rotation={[0, li === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
              fontSize={0.14}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              {`R${rackIndex + 1}`}
            </Text>
          </group>
        ),
      )}

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
  const w = geom.floorWidth + 2.5
  const d = geom.floorDepth + 2.5
  return (
    <group>
      {/* Main concrete floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} metalness={0.08} roughness={0.92} />
      </mesh>
      {/* Concrete expansion joint grid */}
      {Array.from(
        { length: Math.floor(w / 4) + 1 },
        (_, i) => -w / 2 + i * 4,
      ).map((x, i) => (
        <mesh
          key={`jx-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, 0.002, 0]}
        >
          <planeGeometry args={[0.02, d]} />
          <meshStandardMaterial
            color={darkMode ? "#1e293b" : "#9ca3af"}
            metalness={0.05}
            roughness={0.95}
          />
        </mesh>
      ))}
      {Array.from(
        { length: Math.floor(d / 4) + 1 },
        (_, i) => -d / 2 + i * 4,
      ).map((z, i) => (
        <mesh
          key={`jz-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, z]}
        >
          <planeGeometry args={[w, 0.02]} />
          <meshStandardMaterial
            color={darkMode ? "#1e293b" : "#9ca3af"}
            metalness={0.05}
            roughness={0.95}
          />
        </mesh>
      ))}
      {/* Tire scuff marks (subtle wear on high-traffic areas) */}
      {useMemo(() => {
        const marks: Array<{ x: number; z: number; rot: number; w: number }> = []
        const seed = 42
        for (let i = 0; i < 12; i++) {
          const h = (seed * (i + 1) * 7919) % 10000
          marks.push({
            x: ((h % 200) - 100) / 100 * (w / 3),
            z: (((h * 3) % 200) - 100) / 100 * (d / 3),
            rot: (h % 314) / 100,
            w: 0.15 + (h % 30) / 100,
          })
        }
        return marks
      }, [w, d]).map((m, i) => (
        <mesh
          key={`scuff-${i}`}
          rotation={[-Math.PI / 2, m.rot, 0]}
          position={[m.x, 0.003, m.z]}
        >
          <planeGeometry args={[m.w, 0.03]} />
          <meshStandardMaterial
            color={darkMode ? "#0f172a" : "#52525b"}
            metalness={0.05}
            roughness={0.95}
            transparent
            opacity={0.3}
          />
        </mesh>
      ))}
    </group>
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

function SprinklerSystem({
  wallH,
  floorWidth,
  floorDepth,
  trussPositions,
  darkMode,
}: {
  wallH: number
  floorWidth: number
  floorDepth: number
  trussPositions: number[]
  darkMode?: boolean
}) {
  const pipeColor = darkMode ? "#991b1b" : "#dc2626"
  const pipeY = wallH - 0.6

  const headPositions = useMemo(() => {
    const pts: [number, number][] = []
    const spacing = 6
    const hw = floorWidth / 2
    for (let ti = 0; ti < trussPositions.length; ti += 2) {
      const z = trussPositions[ti]!
      const count = Math.max(2, Math.floor(floorWidth / spacing))
      for (let i = 0; i <= count; i++) {
        pts.push([-hw + 1.5 + i * spacing, z])
      }
    }
    return pts
  }, [trussPositions, floorWidth])

  return (
    <group>
      <mesh position={[0, pipeY, 0]}>
        <cylinderGeometry args={[0.035, 0.035, floorDepth + 1, 6]} />
        <meshStandardMaterial color={pipeColor} metalness={0.4} roughness={0.5} />
      </mesh>
      {trussPositions.map((z, i) => (
        <mesh key={i} position={[0, pipeY, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, floorWidth + 1, 4]} />
          <meshStandardMaterial color={pipeColor} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {headPositions.map(([x, z], i) => (
        <mesh key={i} position={[x, pipeY - 0.15, z]}>
          <cylinderGeometry args={[0.02, 0.008, 0.1, 4]} />
          <meshStandardMaterial color="#b91c1c" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}


function ExitSign({
  position,
  rotation,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[0.5, 0.2, 0.03]} />
        <meshStandardMaterial
          color="#15803d"
          emissive="#22c55e"
          emissiveIntensity={0.6}
          metalness={0.1}
          roughness={0.5}
        />
      </mesh>
      <Text
        position={[0, 0, 0.02]}
        fontSize={0.08}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        ВЫХОД →
      </Text>
    </group>
  )
}

function VentilationDuct({
  startX,
  endX,
  y,
  z,
  darkMode,
}: {
  startX: number
  endX: number
  y: number
  z: number
  darkMode?: boolean
}) {
  const length = Math.abs(endX - startX)
  const cx = (startX + endX) / 2
  return (
    <mesh position={[cx, y, z]}>
      <boxGeometry args={[length, 0.35, 0.4]} />
      <meshStandardMaterial
        color={darkMode ? "#475569" : "#94a3b8"}
        metalness={0.5}
        roughness={0.35}
      />
    </mesh>
  )
}

function SafetyBollard({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.7, 6]} />
        <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.063, 0.063, 0.06, 6]} />
        <meshStandardMaterial color="#1c1917" metalness={0.1} roughness={0.8} />
      </mesh>
    </group>
  )
}

function StackedPallets({
  position,
  count,
}: {
  position: [number, number, number]
  count: number
}) {
  const totalH = count * 0.16
  return (
    <group position={position}>
      <mesh position={[0, totalH / 2, 0]}>
        <boxGeometry args={[0.8, totalH, 0.55]} />
        <meshStandardMaterial color="#a16207" metalness={0.05} roughness={0.85} />
      </mesh>
      {/* Stringer gaps (dark lines between pallets) */}
      {Array.from({ length: Math.min(count, 3) }, (_, i) => (
        <mesh key={i} position={[0, (i + 1) * 0.16 - 0.01, 0]}>
          <boxGeometry args={[0.82, 0.01, 0.57]} />
          <meshStandardMaterial color="#78350f" metalness={0.05} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function TrafficCone({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.2, 0.02, 0.2]} />
        <meshStandardMaterial color="#1c1917" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.015, 0.07, 0.32, 6]} />
        <meshStandardMaterial color="#ea580c" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}

function FirstAidStation({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.35, 0.3, 0.12]} />
        <meshStandardMaterial color="white" metalness={0.15} roughness={0.6} />
      </mesh>
      {/* Green cross */}
      <mesh position={[0, 1.3, 0.065]}>
        <boxGeometry args={[0.06, 0.18, 0.005]} />
        <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 1.3, 0.065]}>
        <boxGeometry args={[0.18, 0.06, 0.005]} />
        <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 1.3, -0.065]}>
        <boxGeometry args={[0.06, 0.18, 0.005]} />
        <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 1.3, -0.065]}>
        <boxGeometry args={[0.18, 0.06, 0.005]} />
        <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.2} />
      </mesh>
      {/* Sign above */}
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[0.3, 0.1, 0.008]} />
        <meshStandardMaterial color="#16a34a" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}

function ElectricalPanel({
  position,
  darkMode,
}: {
  position: [number, number, number]
  darkMode?: boolean
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.7, 0.12]} />
        <meshStandardMaterial color={darkMode ? "#374151" : "#6b7280"} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Handle */}
      <mesh position={[0.18, 1.2, 0.07]}>
        <boxGeometry args={[0.025, 0.12, 0.02]} />
        <meshStandardMaterial color="#1c1917" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Warning sign */}
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[0.2, 0.15, 0.008]} />
        <meshStandardMaterial color="#eab308" metalness={0.1} roughness={0.6} />
      </mesh>
      {/* Lightning bolt (triangle approximation) */}
      <mesh position={[0, 1.7, 0.006]}>
        <boxGeometry args={[0.03, 0.08, 0.003]} />
        <meshStandardMaterial color="#1c1917" />
      </mesh>
    </group>
  )
}

function AisleHangingSign({
  position,
  label,
  darkMode,
}: {
  position: [number, number, number]
  label: string
  darkMode?: boolean
}) {
  return (
    <group position={position}>
      {/* Hanging chain/wire */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.6, 4]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Sign panel (double-sided) */}
      <mesh>
        <boxGeometry args={[0.6, 0.35, 0.02]} />
        <meshStandardMaterial
          color={darkMode ? "#1e40af" : "#1d4ed8"}
          metalness={0.15}
          roughness={0.5}
        />
      </mesh>
      <Text
        position={[0, 0, 0.015]}
        fontSize={0.16}
        color="white"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {label}
      </Text>
      <Text
        position={[0, 0, -0.015]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.16}
        color="white"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {label}
      </Text>
    </group>
  )
}

function WarehouseBuilding({ darkMode }: { darkMode?: boolean }) {
  const geom = useWarehouseGeometry()
  const hw = geom.floorWidth / 2 + 1
  const hd = geom.floorDepth / 2 + 1
  const wallH = Math.max(geom.levels * LEVEL_HEIGHT + 4, 7)
  const columnColor = darkMode ? "#334155" : "#64748b"
  const beamColor = darkMode ? "#374151" : "#6b7280"
  const wallBaseColor = darkMode ? "#1e293b" : "#cbd5e1"
  const dockColor = darkMode ? "#334155" : "#475569"
  const markingColor = "#eab308"

  const columnPositions = useMemo(() => {
    const cols: [number, number][] = []
    for (const x of [-hw + 0.3, hw - 0.3]) {
      for (const z of [-hd + 0.3, hd - 0.3]) {
        cols.push([x, z])
      }
    }
    const numSide = Math.max(1, Math.floor(geom.floorDepth / 7))
    for (let i = 1; i < numSide; i++) {
      const z = -hd + 0.3 + (i * (geom.floorDepth + 2 - 0.6)) / numSide
      cols.push([-hw + 0.3, z])
      cols.push([hw - 0.3, z])
    }
    return cols
  }, [hw, hd, geom.floorDepth])

  const trussPositions = useMemo(() => {
    const n = Math.max(2, Math.floor(geom.floorDepth / 6))
    return Array.from({ length: n + 1 }, (_, i) => -hd + 1.5 + (i * (2 * hd - 3)) / n)
  }, [hd, geom.floorDepth])

  const lightPositions = useMemo(() => {
    const pts: [number, number][] = []
    for (let i = 0; i < trussPositions.length; i += 2) {
      const z = trussPositions[i]!
      const numAcross = Math.max(2, Math.floor(geom.floorWidth / 8))
      for (let j = 0; j < numAcross; j++) {
        const x = -hw + 2 + (j * (2 * hw - 4)) / (numAcross - 1)
        pts.push([x, z])
      }
    }
    return pts
  }, [trussPositions, hw, geom.floorWidth])

  const aisleMarkings = useMemo(() => {
    const lines: number[] = []
    for (let pair = 0; pair < geom.pairs - 1; pair++) {
      const z1 = geom.getRowZ(pair * 2 + 1)
      const z2 = geom.getRowZ((pair + 1) * 2)
      lines.push((z1 + z2) / 2)
    }
    return lines
  }, [geom])


  const bollardPositions = useMemo(() => {
    const pts: [number, number, number][] = []
    for (let pair = 0; pair < geom.pairs; pair++) {
      const z1 = geom.getRowZ(pair * 2)
      const z2 = geom.getRowZ(pair * 2 + 1)
      const midZ = (z1 + z2) / 2
      for (const xOff of [-geom.rackLength / 2 - 0.5, geom.rackLength / 2 + 0.5]) {
        pts.push([xOff, 0, midZ])
      }
    }
    return pts
  }, [geom])

  const pedestrianCrossings = useMemo(() => {
    const crossings: Array<{ x: number; z: number }> = []
    if (aisleMarkings.length > 0) {
      crossings.push({ x: -geom.rackLength / 2 - 1, z: aisleMarkings[0]! })
      if (aisleMarkings.length > 1) {
        crossings.push({ x: geom.rackLength / 2 + 1, z: aisleMarkings[aisleMarkings.length - 1]! })
      }
    }
    return crossings
  }, [aisleMarkings, geom])

  return (
    <group>
      {/* Wall base strips (low wainscoting so view stays open during orbit) */}
      {(
        [
          [0, 1, -hd, geom.floorWidth + 2, 2, 0.12, 0],
          [0, 1, hd, geom.floorWidth + 2, 2, 0.12, 0],
          [-hw, 1, 0, 0.12, 2, geom.floorDepth + 2, 0],
          [hw, 1, 0, 0.12, 2, geom.floorDepth + 2, 0],
        ] as [number, number, number, number, number, number, number][]
      ).map(([x, y, z, w, h, d], i) => (
        <mesh key={`wall-${i}`} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={wallBaseColor}
            metalness={0.15}
            roughness={0.85}
          />
        </mesh>
      ))}

      {/* Steel columns */}
      {columnPositions.map(([x, z], i) => (
        <group key={`col-${i}`} position={[x, 0, z]}>
          <mesh position={[0, wallH / 2, 0]}>
            <boxGeometry args={[0.18, wallH, 0.18]} />
            <meshStandardMaterial color={columnColor} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.3, 0.04, 0.3]} />
            <meshStandardMaterial color={columnColor} metalness={0.45} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Ceiling trusses (simplified I-beams) */}
      {trussPositions.map((z, i) => (
        <group key={`truss-${i}`}>
          <mesh position={[0, wallH - 0.15, z]}>
            <boxGeometry args={[geom.floorWidth + 1.5, 0.12, 0.06]} />
            <meshStandardMaterial color={beamColor} metalness={0.45} roughness={0.45} />
          </mesh>
          <mesh position={[0, wallH - 0.25, z]}>
            <boxGeometry args={[geom.floorWidth + 1.5, 0.03, 0.16]} />
            <meshStandardMaterial color={beamColor} metalness={0.45} roughness={0.45} />
          </mesh>
        </group>
      ))}

      {/* Pendant industrial lights */}
      {lightPositions.map(([x, z], i) => (
        <group key={`pendant-${i}`} position={[x, wallH - 1.2, z]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.9, 3]} />
            <meshStandardMaterial color={beamColor} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.12, 0.22, 0.14, 6]} />
            <meshStandardMaterial
              color={darkMode ? "#475569" : "#94a3b8"}
              metalness={0.5}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]}>
            <circleGeometry args={[0.2, 6]} />
            <meshStandardMaterial
              color="white"
              emissive="white"
              emissiveIntensity={darkMode ? 0.5 : 0.3}
            />
          </mesh>
        </group>
      ))}

      {/* Sprinkler system */}
      <SprinklerSystem
        wallH={wallH}
        floorWidth={geom.floorWidth}
        floorDepth={geom.floorDepth}
        trussPositions={trussPositions}
        darkMode={darkMode}
      />

      {/* Ventilation ducts */}
      <VentilationDuct
        startX={-hw + 1}
        endX={hw - 1}
        y={wallH - 0.9}
        z={-hd + 1.5}
        darkMode={darkMode}
      />
      <VentilationDuct
        startX={-hw + 1}
        endX={hw - 1}
        y={wallH - 0.9}
        z={hd - 1.5}
        darkMode={darkMode}
      />

      {/* First aid station */}
      <FirstAidStation position={[-hw + 0.08, 0, 0]} />

      {/* Electrical panel */}
      <ElectricalPanel position={[hw - 0.08, 0, -hd + 2.5]} darkMode={darkMode} />

      {/* Exit signs */}
      {[-4, 0, 4].map((x, i) => (
        <ExitSign
          key={`exit-${i}`}
          position={[x, wallH - 0.8, hd - 0.2]}
          rotation={[0, Math.PI, 0]}
        />
      ))}
      <ExitSign
        position={[-hw + 0.2, wallH - 0.8, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Safety bollards at aisle ends */}
      {bollardPositions.map((pos, i) => (
        <SafetyBollard key={`bollard-${i}`} position={pos} />
      ))}

      {/* Floor aisle markings (yellow dashed center lines) */}
      {aisleMarkings.map((z, ai) => {
        const segments = Math.max(3, Math.floor(geom.rackLength / 2.5))
        return Array.from({ length: segments }, (_, si) => {
          const x =
            -geom.rackLength / 2 + 0.6 + si * (geom.rackLength / segments)
          return (
            <mesh
              key={`mark-${ai}-${si}`}
              position={[x, 0.006, z]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[1.0, 0.06]} />
              <meshStandardMaterial color={markingColor} />
            </mesh>
          )
        })
      })}

      {/* Pedestrian crossing markings (zebra stripes) */}
      {pedestrianCrossings.map((pc, pi) =>
        Array.from({ length: 4 }, (_, si) => (
          <mesh
            key={`ped-${pi}-${si}`}
            position={[pc.x, 0.007, pc.z - 0.35 + si * 0.23]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.8, 0.1]} />
            <meshStandardMaterial color="white" />
          </mesh>
        )),
      )}

      {/* Perimeter floor safety lines */}
      {(
        [
          [0, -hd + 0.8, geom.floorWidth, 0.05],
          [0, hd - 0.8, geom.floorWidth, 0.05],
          [-hw + 0.8, 0, 0.05, geom.floorDepth],
          [hw - 0.8, 0, 0.05, geom.floorDepth],
        ] as [number, number, number, number][]
      ).map(([x, z, w, d], i) => (
        <mesh
          key={`safety-${i}`}
          position={[x, 0.006, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={markingColor} opacity={0.7} transparent />
        </mesh>
      ))}

      {/* Loading dock bays (front wall) with bumpers and levelers */}
      {[-4, 0, 4].map((x, i) => (
        <group key={`dock-${i}`} position={[x, 0, hd - 0.05]}>
          {/* Dock door panel (sectional roller shutter) */}
          <mesh position={[0, 1.7, 0]}>
            <boxGeometry args={[2.6, 3.4, 0.08]} />
            <meshStandardMaterial
              color={dockColor}
              metalness={0.3}
              roughness={0.7}
            />
          </mesh>
          {/* Door horizontal ribs */}
          {[0.55, 1.2, 1.85, 2.5].map((ry, ri) => (
            <mesh key={ri} position={[0, ry, 0.045]}>
              <boxGeometry args={[2.55, 0.03, 0.01]} />
              <meshStandardMaterial
                color={darkMode ? "#1e293b" : "#374151"}
                metalness={0.35}
                roughness={0.6}
              />
            </mesh>
          ))}
          {/* Door frame */}
          {(
            [
              [-1.35, 1.7, 0.08, 3.5],
              [1.35, 1.7, 0.08, 3.5],
              [0, 3.45, 2.78, 0.08],
            ] as [number, number, number, number][]
          ).map(([fx, fy, fw, fh], fi) => (
            <mesh key={`frame-${fi}`} position={[fx, fy, 0.05]}>
              <boxGeometry args={[fw, fh, 0.04]} />
              <meshStandardMaterial
                color={markingColor}
                metalness={0.2}
                roughness={0.6}
              />
            </mesh>
          ))}
          {/* Dock bumpers (rubber pads) */}
          {[-0.9, 0.9].map((bx, bi) => (
            <group key={`bumper-${bi}`} position={[bx, 0.45, 0.08]}>
              <mesh>
                <boxGeometry args={[0.25, 0.6, 0.12]} />
                <meshStandardMaterial color="#1c1917" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0, 0.065]}>
                <boxGeometry args={[0.28, 0.65, 0.015]} />
                <meshStandardMaterial color="#374151" metalness={0.3} roughness={0.7} />
              </mesh>
            </group>
          ))}
          {/* Dock leveler plate */}
          <mesh position={[0, 0.01, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.4, 0.5]} />
            <meshStandardMaterial
              color={darkMode ? "#475569" : "#71717a"}
              metalness={0.45}
              roughness={0.55}
            />
          </mesh>
          {/* Dock leveler tread lines (simplified) */}
          {[0.2, 0.4].map((tz, ri) => (
            <mesh
              key={`tread-${ri}`}
              position={[0, 0.012, tz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[2.3, 0.04]} />
              <meshStandardMaterial color={darkMode ? "#334155" : "#52525b"} metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          {/* Dock light (green/red status light) */}
          <mesh position={[1.5, 3.2, 0.06]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={0.5}
            />
          </mesh>
          {/* Dock number */}
          <Text
            position={[0, 3.6, 0.06]}
            fontSize={0.18}
            color="white"
            anchorX="center"
            anchorY="middle"
            maxWidth={1}
          >
            {`DOK ${i + 1}`}
          </Text>
        </group>
      ))}

      {/* Stacked pallets near dock staging area */}
      <StackedPallets position={[-2.5, 0, hd - 1.5]} count={4} />
      <StackedPallets position={[2.5, 0, hd - 1.5]} count={3} />
      <StackedPallets position={[-hw + 1.5, 0, hd - 2]} count={5} />

      {/* Traffic cones at dock/aisle intersections */}
      <TrafficCone position={[-geom.rackLength / 2 - 1.2, 0, hd - 2]} />
      <TrafficCone position={[geom.rackLength / 2 + 1.2, 0, hd - 2]} />
      <TrafficCone position={[-geom.rackLength / 2 - 1.2, 0, -hd + 2]} />

      {/* Floor drain grates */}
      {[-3, 3].map((x, i) => (
        <mesh key={`drain-${i}`} position={[x, 0.005, hd - 1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.4, 0.4]} />
          <meshStandardMaterial color="#3f3f46" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* Hanging aisle number signs */}
      {aisleMarkings.map((z, ai) => (
        <AisleHangingSign
          key={`aisle-sign-${ai}`}
          position={[0, wallH - 1.8, z]}
          label={`A${ai + 1}`}
          darkMode={darkMode}
        />
      ))}

      {/* Ceiling-hung directional sign (to docks) */}
      <AisleHangingSign
        position={[0, wallH - 1.8, hd - 3]}
        label="ДОКИ →"
        darkMode={darkMode}
      />

      {/* Ceiling-hung directional sign (to storage) */}
      <AisleHangingSign
        position={[0, wallH - 1.8, -hd + 3]}
        label="← ЗОНА ХР."
        darkMode={darkMode}
      />
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
        showPallet={showCargo && (equipmentKind === "forklift" || equipmentKind === "reach_truck")}
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
      {/* Primary directional light (sun-like from high angle) */}
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.8}
        color="#fff5e6"
      />
      {/* Hemisphere light (sky/ground ambient) */}
      <hemisphereLight
        args={[darkMode ? "#1e293b" : "#bfdbfe", darkMode ? "#0f172a" : "#d4d4d8", 0.6]}
      />
      {/* Fill lights from sides */}
      <pointLight
        position={[-10, 8, -8]}
        intensity={0.6}
        distance={45}
        decay={2}
        color={darkMode ? "#94a3b8" : "#e2e8f0"}
      />
      <pointLight
        position={[10, 8, 8]}
        intensity={0.6}
        distance={45}
        decay={2}
        color={darkMode ? "#94a3b8" : "#e2e8f0"}
      />
      {/* Environment map for realistic reflections on metallic surfaces */}
      <Environment preset="warehouse" environmentIntensity={0.4} />
      {/* Soft contact shadows on the floor */}
      <ContactShadows
        position={[0, 0.005, 0]}
        opacity={darkMode ? 0.25 : 0.35}
        scale={50}
        blur={2.5}
        far={12}
      />

      <Floor darkMode={darkMode} />
      <FloorMarkings rowPositions={rowPositions} darkMode={darkMode} />
      <WarehouseBuilding darkMode={darkMode} />
      {/* Static conveyor in staging/dock area */}
      <ConveyorSection
        length={4}
        position={[
          geom.rackLength / 2 + 1.5,
          0,
          geom.floorDepth / 2 - 1,
        ]}
      />
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

const _freeCamSpeed = 8
const _freeCamKeys = new Set<string>()

function FreeCameraController() {
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(0)
  const mouseDown = useRef(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      const e = new Euler().setFromQuaternion(camera.quaternion, "YXZ")
      yaw.current = e.y
      pitch.current = e.x
    }
  }, [camera])

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      mouseDown.current = true
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerUp = (e: PointerEvent) => {
      mouseDown.current = false
      canvas.releasePointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!mouseDown.current) return
      yaw.current -= e.movementX * 0.003
      pitch.current -= e.movementY * 0.003
      pitch.current = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, pitch.current),
      )
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const fwd = new Vector3(0, 0, -1).applyEuler(
        new Euler(pitch.current, yaw.current, 0, "YXZ"),
      )
      camera.position.addScaledVector(fwd, -e.deltaY * 0.02)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      _freeCamKeys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      _freeCamKeys.delete(e.code)
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointerleave", onPointerUp)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointerleave", onPointerUp)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      _freeCamKeys.clear()
    }
  }, [gl, camera])

  useFrame((_, delta) => {
    const camEuler = new Euler(pitch.current, yaw.current, 0, "YXZ")
    camera.quaternion.setFromEuler(camEuler)

    const speed = _freeCamSpeed * delta

    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)

    if (_freeCamKeys.has("KeyW") || _freeCamKeys.has("ArrowUp"))
      camera.position.addScaledVector(forward, speed)
    if (_freeCamKeys.has("KeyS") || _freeCamKeys.has("ArrowDown"))
      camera.position.addScaledVector(forward, -speed)
    if (_freeCamKeys.has("KeyA") || _freeCamKeys.has("ArrowLeft"))
      camera.position.addScaledVector(right, -speed)
    if (_freeCamKeys.has("KeyD") || _freeCamKeys.has("ArrowRight"))
      camera.position.addScaledVector(right, speed)

    if (_freeCamKeys.has("Space")) camera.position.y += speed
    if (_freeCamKeys.has("ShiftLeft") || _freeCamKeys.has("ShiftRight"))
      camera.position.y -= speed
  })

  return null
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
  /** Режим свободной камеры (WASD / стрелки + мышь). */
  freeCameraMode?: boolean
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
  freeCameraMode = false,
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
      {freeCameraMode ? (
        <FreeCameraController />
      ) : (
        <OrbitControls
          enablePan
          enableZoom
          minDistance={14}
          maxDistance={55}
          target={[0, 2, 0]}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      )}
    </Canvas>
  )
}

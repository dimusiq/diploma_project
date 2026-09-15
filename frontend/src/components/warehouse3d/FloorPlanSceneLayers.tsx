/**
 * 3D-слои плана «Сервера устройств»: зоны, стены, доки, техника симулятора.
 */
import { Text } from "@react-three/drei"
import { useMemo } from "react"
import {
  PACKING_POINT,
  RECEIVING_STAGING,
  SHIPPING_STAGING,
} from "@/components/deviceServer/simLayout.ts"
import type { DeviceMotion, TruckMotion } from "@/components/deviceServer/simStore.ts"
import { useSimMotion } from "@/components/deviceServer/useDeviceSimulation.ts"
import {
  FLOOR_PLAN_AISLE_Z,
  FLOOR_PLAN_CORRIDOR_X,
  getFloorPlanDocks,
  getFloorPlanRacks,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
  ZONES,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import { useWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

const ZONE_COLORS: Record<string, string> = {
  receiving: "#0ea5e9",
  storage: "#64748b",
  packing: "#8b5cf6",
  shipping: "#10b981",
  charging: "#f59e0b",
  picking: "#f97316",
}

function ZoneFloor({
  darkMode,
}: {
  darkMode?: boolean
}) {
  return (
    <>
      {ZONES.map((zone) => {
        const cx = planToWorldX(zone.x + zone.w / 2)
        const cz = planToWorldZ(zone.z + zone.d / 2)
        const color = ZONE_COLORS[zone.kind] ?? "#94a3b8"
        return (
          <group key={zone.id}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[cx, 0.06, cz]}
            >
              <planeGeometry args={[zone.w, zone.d]} />
              <meshStandardMaterial
                color={color}
                transparent
                opacity={darkMode ? 0.22 : 0.32}
                roughness={0.95}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
            <Text
              position={[cx, 0.15, cz]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={1.2}
              color={darkMode ? "#e2e8f0" : "#334155"}
              anchorX="center"
              anchorY="middle"
            >
              {zone.name}
            </Text>
          </group>
        )
      })}
    </>
  )
}

function FloorPlanWalls({ darkMode }: { darkMode?: boolean }) {
  const hw = WAREHOUSE_WIDTH / 2
  const hd = WAREHOUSE_DEPTH / 2
  const wallColor = darkMode ? "#334155" : "#cbd5e1"
  const docks = getFloorPlanDocks()

  const westGaps = useMemo(
    () =>
      docks
        .filter((d) => d.direction === "inbound")
        .map((d) => planToWorldZ(d.pos.z))
        .sort((a, b) => a - b),
    [docks],
  )
  const eastGaps = useMemo(
    () =>
      docks
        .filter((d) => d.direction === "outbound")
        .map((d) => planToWorldZ(d.pos.z))
        .sort((a, b) => a - b),
    [docks],
  )

  const wallSegments = (
    halfSpan: number,
    gaps: number[],
    gapHalf: number,
  ): Array<{ center: number; length: number }> => {
    const sorted = [...gaps].sort((a, b) => a - b)
    const segs: Array<{ center: number; length: number }> = []
    let start = -halfSpan
    for (const g of sorted) {
      const a = Math.max(-halfSpan, g - gapHalf)
      const b = Math.min(halfSpan, g + gapHalf)
      if (a > start) segs.push({ center: (start + a) / 2, length: a - start })
      start = Math.max(start, b)
    }
    if (start < halfSpan)
      segs.push({ center: (start + halfSpan) / 2, length: halfSpan - start })
    return segs
  }

  const westSegs = wallSegments(hd, westGaps, 2.5)
  const eastSegs = wallSegments(hd, eastGaps, 2.5)

  return (
    <group>
      <mesh position={[0, 1, -hd]}>
        <boxGeometry args={[WAREHOUSE_WIDTH, 2, 0.12]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1, hd]}>
        <boxGeometry args={[WAREHOUSE_WIDTH, 2, 0.12]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} />
      </mesh>
      {westSegs.map((s, i) => (
        <mesh key={`w-${i}`} position={[-hw, 1, s.center]}>
          <boxGeometry args={[0.12, 2, s.length]} />
          <meshStandardMaterial color={wallColor} roughness={0.85} />
        </mesh>
      ))}
      {eastSegs.map((s, i) => (
        <mesh key={`e-${i}`} position={[hw, 1, s.center]}>
          <boxGeometry args={[0.12, 2, s.length]} />
          <meshStandardMaterial color={wallColor} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function DockBay({
  x,
  z,
  direction,
  darkMode,
}: {
  x: number
  z: number
  direction: "inbound" | "outbound"
  darkMode?: boolean
}) {
  const wx = planToWorldX(x)
  const wz = planToWorldZ(z)
  const rotY = direction === "inbound" ? Math.PI / 2 : -Math.PI / 2
  const dockColor = darkMode ? "#475569" : "#64748b"
  return (
    <group position={[wx, 0, wz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1.7, direction === "inbound" ? -0.05 : 0.05]}>
        <boxGeometry args={[2.6, 3.4, 0.08]} />
        <meshStandardMaterial color={dockColor} metalness={0.3} roughness={0.7} />
      </mesh>
    </group>
  )
}

const STAGING_MARKERS = [
  { pos: RECEIVING_STAGING, label: "Буфер приёмки" },
  { pos: PACKING_POINT, label: "Упаковка" },
  { pos: SHIPPING_STAGING, label: "Буфер отгрузки" },
] as const

function StagingMarkers({ darkMode }: { darkMode?: boolean }) {
  const ringColor = darkMode ? "#94a3b8" : "#64748b"
  return (
    <>
      {STAGING_MARKERS.map((marker) => {
        const wx = planToWorldX(marker.pos.x)
        const wz = planToWorldZ(marker.pos.z)
        return (
          <group key={marker.label} position={[wx, 0.12, wz]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.8, 1.2, 24]} />
              <meshStandardMaterial color={ringColor} opacity={0.7} transparent />
            </mesh>
            <Text
              position={[0, 0.1, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.65}
              color={ringColor}
              anchorX="center"
              anchorY="middle"
            >
              {marker.label}
            </Text>
          </group>
        )
      })}
    </>
  )
}

function YardAreas({ darkMode }: { darkMode?: boolean }) {
  const westX = planToWorldX(-12)
  const eastX = planToWorldX(116)
  const color = darkMode ? "#1e293b" : "#e2e8f0"
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[westX, 0.04, 0]}>
        <planeGeometry args={[14, WAREHOUSE_DEPTH]} />
        <meshStandardMaterial
          color={color}
          opacity={0.5}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[eastX, 0.04, 0]}>
        <planeGeometry args={[14, WAREHOUSE_DEPTH]} />
        <meshStandardMaterial
          color={color}
          opacity={0.5}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </>
  )
}

function FloorPlanDocks({ darkMode }: { darkMode?: boolean }) {
  const docks = getFloorPlanDocks()
  const motion = useSimMotion()
  return (
    <>
      {docks.map((dock) => {
        const door = motion.devices.find((d) => d.id === dock.id)
        const busy = door?.status === "occupied"
        return (
          <group key={dock.id}>
            <mesh
              position={[
                planToWorldX(dock.pos.x),
                0.05,
                planToWorldZ(dock.pos.z),
              ]}
            >
              <boxGeometry args={[3.5, 0.1, 4.5]} />
              <meshStandardMaterial
                color={busy ? "#10b981" : darkMode ? "#64748b" : "#94a3b8"}
                opacity={0.85}
              />
            </mesh>
            <DockBay
              x={dock.pos.x}
              z={dock.pos.z}
              direction={dock.direction}
              darkMode={darkMode}
            />
            <Text
              position={[
                planToWorldX(dock.pos.x),
                0.2,
                planToWorldZ(dock.pos.z + 4),
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.55}
              color={darkMode ? "#cbd5e1" : "#475569"}
              anchorX="center"
            >
              {dock.code}
            </Text>
          </group>
        )
      })}
    </>
  )
}

function AisleMarkings({ darkMode }: { darkMode?: boolean }) {
  const color = darkMode ? "#eab308" : "#ca8a04"
  const racks = getFloorPlanRacks()
  const minX = Math.min(...racks.map((rack) => rack.x))
  const maxX = Math.max(...racks.map((rack) => rack.x + rack.w))
  const span = Math.max(8, maxX - minX)
  const segments = Math.max(6, Math.floor(span / 3))
  return (
    <>
      {FLOOR_PLAN_AISLE_Z.map((planZ, ai) => {
        const wz = planToWorldZ(planZ)
        return Array.from({ length: segments }, (_, si) => {
          const t = (si + 0.5) / segments
          const wx = planToWorldX(minX + t * span)
          return (
            <mesh
              key={`aisle-${ai}-${si}`}
              position={[wx, 0.09, wz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[1.2, 0.08]} />
              <meshStandardMaterial
                color={color}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          )
        })
      })}
      {FLOOR_PLAN_CORRIDOR_X.map((planX, ci) => {
        const wx = planToWorldX(planX)
        return (
          <mesh
            key={`corr-${ci}`}
            position={[wx, 0.08, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.08, WAREHOUSE_DEPTH - 4]} />
            <meshStandardMaterial
              color={color}
              opacity={0.5}
              transparent
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        )
      })}
    </>
  )
}

function DeviceMarker({
  device,
  darkMode,
}: {
  device: DeviceMotion
  darkMode?: boolean
}) {
  const wx = planToWorldX(device.x)
  const wz = planToWorldZ(device.z)
  const color =
    !device.online
      ? "#94a3b8"
      : device.status === "fault" || device.alarm
        ? "#ef4444"
        : device.kind === "forklift"
          ? "#f59e0b"
          : device.kind === "agv"
            ? "#0ea5e9"
            : device.kind === "amr"
              ? "#8b5cf6"
              : "#64748b"

  const [w, h, d] =
    device.kind === "forklift"
      ? [2.2, 1.2, 1.4]
      : device.kind === "agv" || device.kind === "amr"
        ? [1.4, 0.6, 1.4]
        : [0.8, 0.5, 0.8]

  if (
    device.kind !== "forklift" &&
    device.kind !== "agv" &&
    device.kind !== "amr"
  ) {
    return null
  }

  return (
    <group position={[wx, h / 2 + 0.05, wz]}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={darkMode ? 0.25 : 0.08}
        />
      </mesh>
      {device.carrying && (
        <mesh position={[0, h / 2 + 0.35, 0]}>
          <boxGeometry args={[0.9, 0.5, 0.9]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
      )}
    </group>
  )
}

function TruckMarker({
  truck,
  darkMode,
}: {
  truck: TruckMotion
  darkMode?: boolean
}) {
  const wx = planToWorldX(truck.x)
  const wz = planToWorldZ(truck.z)
  const color =
    truck.direction === "inbound"
      ? darkMode
        ? "#38bdf8"
        : "#0284c7"
      : darkMode
        ? "#34d399"
        : "#059669"
  return (
    <group position={[wx, 0.9, wz]}>
      <mesh>
        <boxGeometry args={[3.2, 1.8, 1.6]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  )
}

export function SimDevicesLayer({ darkMode }: { darkMode?: boolean }) {
  const motion = useSimMotion()
  const mobile = motion.devices.filter(
    (d) => d.kind === "forklift" || d.kind === "agv" || d.kind === "amr",
  )
  return (
    <>
      {mobile.map((d) => (
        <DeviceMarker key={d.id} device={d} darkMode={darkMode} />
      ))}
      {motion.trucks.map((t) => (
        <TruckMarker key={t.id} truck={t} darkMode={darkMode} />
      ))}
    </>
  )
}

export function FloorPlanSceneLayers({
  darkMode,
  showSimDevices = true,
  showZones = true,
}: {
  darkMode?: boolean
  showSimDevices?: boolean
  showZones?: boolean
}) {
  const geom = useWarehouseGeometry()
  if (!geom.floorPlanMode) return null
  return (
    <>
      <YardAreas darkMode={darkMode} />
      {showZones && <ZoneFloor darkMode={darkMode} />}
      <AisleMarkings darkMode={darkMode} />
      <StagingMarkers darkMode={darkMode} />
      <FloorPlanWalls darkMode={darkMode} />
      <FloorPlanDocks darkMode={darkMode} />
      {showSimDevices && <SimDevicesLayer darkMode={darkMode} />}
    </>
  )
}

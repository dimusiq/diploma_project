/**
 * 3D-renderer того же склада, что и WarehouseLiveMap.
 * Позиции техники — только из simStore / SSE, без собственной симуляции.
 */
import { Html, OrbitControls, Text } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type Group, MathUtils, Vector3 } from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { Button } from "@/components/ui/button.tsx"
import { FloorPlanRackRow } from "@/components/warehouse3d/FloorPlanRackRow.tsx"
import { FloorPlanSceneLayers } from "@/components/warehouse3d/FloorPlanSceneLayers.tsx"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import {
  FLOOR_PLAN_LAYOUT_SPEC,
  getFloorPlanRacks,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import {
  useWarehouseGeometry,
  WarehouseGeometryProvider,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import { cn } from "@/lib/utils"
import { taskKindLabel } from "./simFormat.ts"
import {
  type DeviceMotion,
  deviceSimulation,
  type TruckMotion,
} from "./simStore.ts"
import type { SimDevice, SimTask, SimZone } from "./simTypes.ts"
import { occupiedCellKeysForTwin } from "./twinOccupancy.ts"
import { useSimData, useSimMotion } from "./useDeviceSimulation.ts"

const ZONE_COLORS: Record<string, string> = {
  receiving: "#0ea5e9",
  storage: "#64748b",
  packing: "#8b5cf6",
  shipping: "#10b981",
  charging: "#f59e0b",
  picking: "#f97316",
  yard: "#94a3b8",
}

type CameraCommand = "reset" | "top" | "agv" | "rack"

const INITIAL_CAMERA: [number, number, number] = [0, 78, 92]
const INITIAL_TARGET: [number, number, number] = [0, 2, 0]

function deviceColor(device: DeviceMotion): string {
  if (!device.online) return "#94a3b8"
  if (device.status === "fault" || device.status === "jam") return "#ef4444"
  if (device.alarm) return "#f59e0b"
  if (device.status === "charging") return "#d97706"
  if (device.status === "waiting") return "#f97316"
  switch (device.kind) {
    case "forklift":
      return "#f59e0b"
    case "agv":
      return "#0ea5e9"
    case "amr":
      return "#8b5cf6"
    default:
      return "#64748b"
  }
}

function TopologyZones({
  zones,
  darkMode,
}: {
  zones: SimZone[]
  darkMode?: boolean
}) {
  return (
    <>
      {zones.map((zone) => {
        const cx = planToWorldX(zone.x + zone.w / 2)
        const cz = planToWorldZ(zone.z + zone.d / 2)
        const color = ZONE_COLORS[zone.kind] ?? "#94a3b8"
        return (
          <group key={zone.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.06, cz]}>
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

function InterpolatedMobile({
  device,
  task,
  selected,
  darkMode,
  onSelect,
}: {
  device: DeviceMotion
  task: SimTask | undefined
  selected: boolean
  darkMode?: boolean
  onSelect: () => void
}) {
  const group = useRef<Group>(null)
  const current = useRef(
    new Vector3(planToWorldX(device.x), 0.4, planToWorldZ(device.z)),
  )
  const target = useRef(new Vector3())
  const heading = useRef(0)
  const color = deviceColor(device)
  const [w, h, d] =
    device.kind === "forklift" ? [2.2, 1.2, 1.4] : [1.4, 0.65, 1.4]

  useFrame((_, dt) => {
    target.current.set(planToWorldX(device.x), h / 2 + 0.05, planToWorldZ(device.z))
    const dx = target.current.x - current.current.x
    const dz = target.current.z - current.current.z
    if (Math.abs(dx) + Math.abs(dz) > 0.04) {
      heading.current = Math.atan2(dx, dz)
    }
    current.current.lerp(target.current, 1 - Math.exp(-dt * 10))
    const node = group.current
    if (!node) return
    node.position.copy(current.current)
    node.rotation.y = MathUtils.damp(node.rotation.y, heading.current, 8, dt)
  })

  const label =
    selected && device.battery !== null
      ? `${device.id.toUpperCase()} ${Math.round(device.battery)}%`
      : device.id.toUpperCase()

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.35 : darkMode ? 0.2 : 0.08}
        />
      </mesh>
      {device.carrying && (
        <mesh position={[0, h / 2 + 0.35, 0]}>
          <boxGeometry args={[0.9, 0.5, 0.9]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.6, 1.85, 24]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
      )}
      <Html position={[0, h + 0.6, 0]} center distanceFactor={28} zIndexRange={[10, 0]}>
        <div
          className={cn(
            "whitespace-nowrap rounded-sm px-1 py-0.5 text-[10px] font-medium shadow-sm",
            selected
              ? "bg-background text-foreground"
              : "bg-background/80 text-muted-foreground",
          )}
        >
          {label}
          {task ? ` · ${taskKindLabel(task.kind)} → ${task.toLabel}` : ""}
        </div>
      </Html>
    </group>
  )
}

function TruckMesh({ truck }: { truck: TruckMotion }) {
  const wx = planToWorldX(truck.x)
  const wz = planToWorldZ(truck.z)
  const color = truck.direction === "inbound" ? "#0284c7" : "#059669"
  return (
    <group position={[wx, 0.9, wz]}>
      <mesh>
        <boxGeometry args={[3.2, 1.8, 1.6]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <Text position={[0, 1.3, 0]} fontSize={0.45} color="#e2e8f0" anchorX="center">
        {truck.plate}
      </Text>
    </group>
  )
}

function CameraCommands({
  command,
  agvTarget,
  rackTarget,
  onConsumed,
}: {
  command: CameraCommand | null
  agvTarget: [number, number, number] | null
  rackTarget: [number, number, number] | null
  onConsumed: () => void
}) {
  const { camera, controls } = useThree()
  const agvRef = useRef(agvTarget)
  const rackRef = useRef(rackTarget)
  agvRef.current = agvTarget
  rackRef.current = rackTarget

  useEffect(() => {
    if (!command) return
    const orbit = controls as OrbitControlsImpl | null
    if (!orbit) return
    const agv = agvRef.current
    const rack = rackRef.current
    if (command === "reset") {
      camera.position.set(...INITIAL_CAMERA)
      orbit.target.set(...INITIAL_TARGET)
    } else if (command === "top") {
      camera.position.set(0, 128, 0.08)
      orbit.target.set(0, 0, 0)
    } else if (command === "agv" && agv) {
      camera.position.set(agv[0] + 16, 12, agv[2] + 16)
      orbit.target.set(agv[0], 1, agv[2])
    } else if (command === "rack" && rack) {
      camera.position.set(rack[0] + 10, 14, rack[2] + 18)
      orbit.target.set(rack[0], 2, rack[2])
    }
    orbit.update()
    onConsumed()
  }, [command, camera, controls, onConsumed])
  return null
}

function TwinScene({
  selectedDeviceId,
  onSelectDevice,
  selectedCell,
  onSelectCell,
  darkMode,
  cameraCommand,
  onCameraConsumed,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  selectedCell: CellInfo | null
  onSelectCell: (info: CellInfo | null) => void
  darkMode?: boolean
  cameraCommand: CameraCommand | null
  onCameraConsumed: () => void
}) {
  const motion = useSimMotion()
  const data = useSimData()
  const geom = useWarehouseGeometry()
  const topology = deviceSimulation.topology
  const racks = getFloorPlanRacks()

  const occupiedCellKeys = useMemo(
    () => occupiedCellKeysForTwin(data.occupiedCellIds, motion.rackFill),
    [data.occupiedCellIds, motion.rackFill],
  )
  const fillByRack = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of motion.rackFill) {
      map.set(item.rackId, item.total > 0 ? item.occupied / item.total : 0)
    }
    return map
  }, [motion.rackFill])

  const mobile = motion.devices.filter(
    (device) =>
      device.kind === "forklift" || device.kind === "agv" || device.kind === "amr",
  )
  const tasksByDevice = useMemo(() => {
    const map = new Map<string, SimTask>()
    for (const task of data.tasks) {
      if (!task.deviceId || task.status === "done") continue
      map.set(task.deviceId, task)
    }
    return map
  }, [data.tasks])

  const selectedMobile =
    mobile.find((device) => device.id === selectedDeviceId) ?? mobile[0] ?? null
  const agvTarget: [number, number, number] | null = selectedMobile
    ? [planToWorldX(selectedMobile.x), 1, planToWorldZ(selectedMobile.z)]
    : null
  const focusRackIndex = selectedCell?.row ?? 0
  const rackTarget: [number, number, number] = [
    geom.getRackBaseX(focusRackIndex),
    2,
    geom.getRowZ(focusRackIndex),
  ]

  return (
    <>
      <color attach="background" args={[darkMode ? "#0f172a" : "#e5e7eb"]} />
      <ambientLight intensity={darkMode ? 0.45 : 0.7} />
      <directionalLight position={[40, 80, 30]} intensity={1.15} />
      <directionalLight position={[-30, 40, -20]} intensity={0.35} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[WAREHOUSE_WIDTH + 40, WAREHOUSE_DEPTH + 24]} />
        <meshStandardMaterial
          color={darkMode ? "#334155" : "#9ca3af"}
          roughness={0.95}
        />
      </mesh>
      <TopologyZones zones={topology.zones} darkMode={darkMode} />
      <FloorPlanSceneLayers
        darkMode={darkMode}
        showSimDevices={false}
        showZones={false}
      />
      {racks.map((rack, rackIndex) => (
        <FloorPlanRackRow
          key={rack.id}
          rackIndex={rackIndex}
          baseX={geom.getRackBaseX(rackIndex)}
          baseZ={geom.getRowZ(rackIndex)}
          selectedCell={selectedCell}
          darkMode={darkMode}
          onCellClick={onSelectCell}
          occupiedCellKeys={occupiedCellKeys}
          fillRatio={fillByRack.get(rack.id) ?? 0}
        />
      ))}
      {mobile.map((device) => (
        <InterpolatedMobile
          key={device.id}
          device={device}
          task={tasksByDevice.get(device.id)}
          selected={device.id === selectedDeviceId}
          darkMode={darkMode}
          onSelect={() =>
            onSelectDevice(device.id === selectedDeviceId ? null : device.id)
          }
        />
      ))}
      {motion.trucks.map((truck) => (
        <TruckMesh key={truck.id} truck={truck} />
      ))}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        minDistance={22}
        maxDistance={220}
        target={INITIAL_TARGET}
        maxPolarAngle={Math.PI / 2 - 0.08}
      />
      <CameraCommands
        command={cameraCommand}
        agvTarget={agvTarget}
        rackTarget={rackTarget}
        onConsumed={onCameraConsumed}
      />
    </>
  )
}

function cellCaption(info: CellInfo): string {
  const rack = getFloorPlanRacks()[info.row]
  const code = rack?.code ?? `R${String(info.row + 1).padStart(2, "0")}`
  return `${code}-${String(info.cellX + 1).padStart(2, "0")}-${info.level + 1}`
}

export function Warehouse3D({
  selectedDeviceId,
  onSelectDevice,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
}) {
  const { resolvedTheme } = useTheme()
  const darkMode = resolvedTheme === "dark"
  const motion = useSimMotion()
  const data = useSimData()
  const [selectedCell, setSelectedCell] = useState<CellInfo | null>(null)
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null)
  const consumeCamera = useCallback(() => setCameraCommand(null), [])

  const selectedDevice: SimDevice | undefined = data.devices.find(
    (device) => device.id === selectedDeviceId,
  )
  const selectedTask = data.tasks.find(
    (task) =>
      task.deviceId === selectedDeviceId && task.status !== "done",
  )
  const selectedRack =
    selectedCell != null ? getFloorPlanRacks()[selectedCell.row] : undefined
  const rackFill = selectedRack
    ? motion.rackFill.find((row) => row.rackId === selectedRack.id)
    : undefined

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <div className="absolute top-2 right-2 z-10 flex flex-wrap justify-end gap-1">
        <Button type="button" size="xs" variant="outline" onClick={() => setCameraCommand("reset")}>
          Reset View
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => setCameraCommand("top")}>
          Top View
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => setCameraCommand("agv")}>
          Focus AGV
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => setCameraCommand("rack")}>
          Focus Rack
        </Button>
      </div>
      <div className="h-[min(62vh,640px)] w-full min-h-[420px]">
        <Canvas
          camera={{ position: INITIAL_CAMERA, fov: 42, near: 0.8, far: 400 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, logarithmicDepthBuffer: true }}
        >
          <WarehouseGeometryProvider spec={FLOOR_PLAN_LAYOUT_SPEC}>
            <TwinScene
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={onSelectDevice}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
              darkMode={darkMode}
              cameraCommand={cameraCommand}
              onCameraConsumed={consumeCamera}
            />
          </WarehouseGeometryProvider>
        </Canvas>
      </div>
      {(selectedDevice || selectedCell) && (
        <div className="absolute bottom-8 left-2 max-w-sm rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm">
          {selectedDevice && (
            <p>
              <span className="font-semibold">{selectedDevice.name}</span>
              {" · "}
              {selectedDevice.status}
              {selectedTask
                ? ` · ${taskKindLabel(selectedTask.kind)} → ${selectedTask.toLabel}`
                : ""}
            </p>
          )}
          {selectedCell && selectedRack && (
            <p>
              <span className="font-semibold">{cellCaption(selectedCell)}</span>
              {` · ${selectedCell.filled ? "Occupied" : "Free"}`}
              {rackFill
                ? ` · ${selectedRack.code} ${rackFill.occupied}/${rackFill.total}`
                : ""}
            </p>
          )}
        </div>
      )}
      <TwinLegend />
    </div>
  )
}

function TwinLegend() {
  const items = [
    { tone: "bg-amber-500", label: "Погрузчики" },
    { tone: "bg-sky-500", label: "AGV" },
    { tone: "bg-violet-500", label: "AMR" },
    { tone: "bg-orange-400", label: "Паллета на технике" },
    { tone: "bg-destructive", label: "Отказ / замятие" },
    { tone: "bg-emerald-600", label: "Занятая ячейка" },
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", item.tone)} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

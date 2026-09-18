/**
 * 3D-renderer того же склада, что и WarehouseLiveMap.
 * Позиции техники — только из simStore / SSE, без собственной симуляции.
 */
import { OrbitControls } from "@react-three/drei"
import { Canvas, useThree } from "@react-three/fiber"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { Button } from "@/components/ui/button.tsx"
import { DynamicFleet } from "@/components/warehouse3d/twin/DynamicFleet.tsx"
import { OccupancySystem } from "@/components/warehouse3d/twin/OccupancySystem.tsx"
import { TwinPerfHud, TwinPerfSampler } from "@/components/warehouse3d/twin/PerfOverlay.tsx"
import { TwinStaticScene } from "@/components/warehouse3d/twin/TwinStaticScene.tsx"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import {
  FLOOR_PLAN_LAYOUT_SPEC,
  getFloorPlanRacks,
  getFloorPlanTopology,
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import {
  useWarehouseGeometry,
  WarehouseGeometryProvider,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import { cn } from "@/lib/utils"
import { deviceStatusLabel, taskKindLabel } from "./simFormat.ts"
import { deviceSimulation } from "./simStore.ts"
import type { SimDevice } from "./simTypes.ts"
import { occupiedCellKeysFromIds } from "./twinOccupancy.ts"
import { useSimData } from "./useDeviceSimulation.ts"

type CameraCommand = "reset" | "top" | "agv" | "rack"

const INITIAL_CAMERA: [number, number, number] = [48, 98, 86]
const INITIAL_TARGET: [number, number, number] = [0, 1.4, 0]
const DEV_PERF = import.meta.env.DEV

function CameraCommands({
  command,
  selectedDeviceId,
  rackTarget,
  onConsumed,
}: {
  command: CameraCommand | null
  selectedDeviceId: string | null
  rackTarget: [number, number, number]
  onConsumed: () => void
}) {
  const { camera, controls } = useThree()

  useEffect(() => {
    if (!command) return
    const orbit = controls as OrbitControlsImpl | null
    if (!orbit) return
    if (command === "reset") {
      camera.position.set(...INITIAL_CAMERA)
      orbit.target.set(...INITIAL_TARGET)
    } else if (command === "top") {
      camera.position.set(0, 148, 0.08)
      orbit.target.set(0, 0, 0)
    } else if (command === "agv") {
      const snap = deviceSimulation.getMotionSnapshot()
      const mobile =
        snap.devices.find((device) => device.id === selectedDeviceId) ??
        snap.devices.find(
          (device) =>
            device.kind === "agv" ||
            device.kind === "amr" ||
            device.kind === "forklift",
        )
      if (mobile) {
        const x = planToWorldX(mobile.x)
        const z = planToWorldZ(mobile.z)
        camera.position.set(x + 16, 12, z + 16)
        orbit.target.set(x, 1, z)
      }
    } else if (command === "rack") {
      camera.position.set(rackTarget[0] + 8, 9, rackTarget[2] + 12)
      orbit.target.set(rackTarget[0], 2.2, rackTarget[2])
    }
    orbit.update()
    onConsumed()
  }, [command, camera, controls, onConsumed, rackTarget, selectedDeviceId])
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
  const geom = useWarehouseGeometry()
  const topology = getFloorPlanTopology()
  const focusRackIndex = selectedCell?.row ?? 0
  const rackTarget: [number, number, number] = [
    geom.getRackBaseX(focusRackIndex),
    2,
    geom.getRowZ(focusRackIndex),
  ]

  return (
    <>
      <color attach="background" args={[darkMode ? "#334155" : "#d6d3d1"]} />
      <TwinStaticScene zones={topology.zones} darkMode={darkMode} />
      <OccupancySystem
        selectedCell={selectedCell}
        onSelectCell={onSelectCell}
      />
      <DynamicFleet
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={onSelectDevice}
        darkMode={darkMode}
      />
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
        selectedDeviceId={selectedDeviceId}
        rackTarget={rackTarget}
        onConsumed={onCameraConsumed}
      />
      <TwinPerfSampler enabled={DEV_PERF} />
    </>
  )
}

function cellCaption(info: CellInfo): string {
  const rack = getFloorPlanRacks()[info.row]
  const code = rack?.code ?? `R${String(info.row + 1).padStart(2, "0")}`
  return `${code}-L${info.level + 1}-C${String(info.cellX + 1).padStart(2, "0")}`
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function Warehouse3D({
  selectedDeviceId,
  onSelectDevice,
  active = true,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  active?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const darkMode = resolvedTheme === "dark"
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
  const occupiedKeys = useMemo(
    () => occupiedCellKeysFromIds(data.occupiedCellIds),
    [data.occupiedCellIds],
  )
  const rackTotal = selectedRack
    ? selectedRack.bays * selectedRack.levels
    : 0
  const rackOccupied = useMemo(() => {
    if (!selectedRack) return 0
    const prefix = `${selectedCell?.row}-`
    let n = 0
    for (const key of occupiedKeys) {
      if (key.startsWith(prefix)) n += 1
    }
    return n
  }, [occupiedKeys, selectedRack, selectedCell?.row])
  const rackOccupancyPct =
    rackTotal > 0 ? Math.round((rackOccupied / rackTotal) * 1000) / 10 : 0
  const showMobileInspector =
    selectedDevice &&
    (selectedDevice.kind === "agv" ||
      selectedDevice.kind === "amr" ||
      selectedDevice.kind === "forklift")

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
          camera={{ position: INITIAL_CAMERA, fov: 38, near: 0.8, far: 500 }}
          dpr={[1, 1.5]}
          frameloop={active ? "always" : "never"}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            logarithmicDepthBuffer: true,
          }}
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
      <TwinPerfHud enabled={DEV_PERF} />
      {(showMobileInspector || selectedCell) && (
        <div className="absolute bottom-8 left-2 max-w-sm space-y-3 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm">
          {showMobileInspector && selectedDevice && (
            <div className="space-y-1">
              <p className="font-semibold">
                {selectedDevice.kind === "forklift" ? "Forklift" : "AGV"}
              </p>
              <InspectorRow label="AGV ID" value={selectedDevice.id} />
              <InspectorRow
                label="Status"
                value={deviceStatusLabel(selectedDevice.status)}
              />
              <InspectorRow
                label="Task"
                value={
                  selectedTask
                    ? `${taskKindLabel(selectedTask.kind)} → ${selectedTask.toLabel}`
                    : "—"
                }
              />
              <InspectorRow
                label="Speed"
                value={`${selectedDevice.speed.toFixed(2)} m/s`}
              />
              <InspectorRow
                label="Battery"
                value={
                  selectedDevice.battery !== null
                    ? `${Math.round(selectedDevice.battery)}%`
                    : "—"
                }
              />
              <InspectorRow
                label="Position"
                value={`${selectedDevice.pos.x.toFixed(1)}, ${selectedDevice.pos.z.toFixed(1)}`}
              />
            </div>
          )}
          {selectedCell && selectedRack && (
            <div className="space-y-1">
              <p className="font-semibold">{cellCaption(selectedCell)}</p>
              <InspectorRow label="Rack ID" value={selectedRack.code} />
              <InspectorRow label="Block" value={selectedRack.blockId ?? "—"} />
              <InspectorRow label="Side" value={selectedRack.side ?? "—"} />
              <InspectorRow
                label="Levels"
                value={String(selectedRack.levels)}
              />
              <InspectorRow label="Total cells" value={String(rackTotal)} />
              <InspectorRow
                label="Occupied cells"
                value={String(rackOccupied)}
              />
              <InspectorRow
                label="Occupancy %"
                value={`${rackOccupancyPct}%`}
              />
            </div>
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
    { tone: "bg-amber-800", label: "Паллета в ячейке" },
    { tone: "bg-slate-500", label: "Пустая ячейка / каркас" },
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

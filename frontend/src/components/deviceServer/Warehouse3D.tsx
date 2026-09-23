/**
 * 3D-renderer того же склада, что и WarehouseLiveMap.
 * Позиции техники — только из simStore / SSE, без собственной симуляции.
 */
import { OrbitControls } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { MathUtils } from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { AgvCameraProbe } from "@/components/digitalTwin/AgvCameraProbe.tsx"
import { CameraDebugMarkers } from "@/components/digitalTwin/CameraDebugMarkers.tsx"
import {
  cameraDebugEnabled,
  consumeFocusDetection,
  getShowCameraFrustum,
  setShowCameraFrustum,
  subscribeFocusDetection,
  subscribeCameraFrustum,
} from "@/components/digitalTwin/agvCameraBridge.ts"
import {
  consumeAgvCameraView,
  subscribeAgvCameraView,
} from "@/components/digitalTwin/twinCameraFollow.ts"
import { Button } from "@/components/ui/button.tsx"
import { DynamicFleet } from "@/components/warehouse3d/twin/DynamicFleet.tsx"
import { TwinPeople } from "@/components/warehouse3d/twin/TwinPeople.tsx"
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
import { deviceSimulation } from "./simStore.ts"
import { occupiedCellKeysFromIds } from "./twinOccupancy.ts"
import { useSimData } from "./useDeviceSimulation.ts"

type CameraCommand = "reset" | "top" | "agv" | "rack" | "follow" | "focus"

const INITIAL_CAMERA: [number, number, number] = [48, 98, 86]
const INITIAL_TARGET: [number, number, number] = [0, 1.4, 0]
const DEV_PERF =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("perf") === "1")

function CameraCommands({
  command,
  selectedDeviceId,
  rackTarget,
  focusPoint,
  onConsumed,
}: {
  command: CameraCommand | null
  selectedDeviceId: string | null
  rackTarget: [number, number, number]
  focusPoint: [number, number, number] | null
  onConsumed: () => void
}) {
  const { camera, controls } = useThree()
  const heading = useRef(0)
  const last = useRef<{ x: number; z: number } | null>(null)
  const goal = useRef<{
    px: number
    py: number
    pz: number
    tx: number
    ty: number
    tz: number
  } | null>(null)

  useFrame((_, dt) => {
    const orbit = controls as OrbitControlsImpl | null
    const target = goal.current
    if (!orbit || !target) return
    camera.position.x = MathUtils.damp(camera.position.x, target.px, 3.5, dt)
    camera.position.y = MathUtils.damp(camera.position.y, target.py, 3.5, dt)
    camera.position.z = MathUtils.damp(camera.position.z, target.pz, 3.5, dt)
    orbit.target.x = MathUtils.damp(orbit.target.x, target.tx, 3.5, dt)
    orbit.target.y = MathUtils.damp(orbit.target.y, target.ty, 3.5, dt)
    orbit.target.z = MathUtils.damp(orbit.target.z, target.tz, 3.5, dt)
    orbit.update()
    const settled =
      Math.abs(camera.position.x - target.px) < 0.4 &&
      Math.abs(camera.position.z - target.pz) < 0.4
    if (settled) goal.current = null
  })

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
    } else if (command === "focus" && focusPoint) {
      camera.position.set(focusPoint[0] + 16, focusPoint[1] + 10, focusPoint[2] + 16)
      orbit.target.set(focusPoint[0], focusPoint[1], focusPoint[2])
    } else if (command === "follow") {
      const snap = deviceSimulation.getMotionSnapshot()
      const mobile = snap.devices.find((device) => device.id === selectedDeviceId)
      if (mobile) {
        const x = planToWorldX(mobile.x)
        const z = planToWorldZ(mobile.z)
        const prev = last.current
        if (prev && Math.abs(x - prev.x) + Math.abs(z - prev.z) > 0.2) {
          heading.current = Math.atan2(x - prev.x, z - prev.z)
        }
        last.current = { x, z }
        const fx = Math.sin(heading.current)
        const fz = Math.cos(heading.current)
        goal.current = {
          px: x - fx * 28,
          py: 8,
          pz: z - fz * 28,
          tx: x + fx * 8,
          ty: 1.2,
          tz: z + fz * 8,
        }
      }
    }
    if (command !== "follow") goal.current = null
    orbit.update()
    onConsumed()
  }, [command, camera, controls, onConsumed, rackTarget, selectedDeviceId, focusPoint])
  return null
}

function TwinScene({
  selectedDeviceId,
  onSelectDevice,
  selectedPersonId,
  onSelectPerson,
  selectedCell,
  onSelectCell,
  darkMode,
  cameraCommand,
  focusPoint,
  onCameraConsumed,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  selectedPersonId: string | null
  onSelectPerson: (personId: string | null) => void
  selectedCell: CellInfo | null
  onSelectCell: (info: CellInfo | null) => void
  darkMode?: boolean
  cameraCommand: CameraCommand | null
  focusPoint: [number, number, number] | null
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
      <TwinPeople
        selectedId={selectedPersonId}
        onSelect={(personId) => {
          onSelectDevice(null)
          onSelectPerson(personId)
        }}
      />
      <AgvCameraProbe />
      {cameraDebugEnabled() ? <CameraDebugMarkers /> : null}
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
        focusPoint={focusPoint}
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
  selectedPersonId = null,
  onSelectPerson = () => undefined,
  active = true,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  selectedPersonId?: string | null
  onSelectPerson?: (personId: string | null) => void
  active?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const darkMode = resolvedTheme === "dark"
  const data = useSimData()
  const [selectedCell, setSelectedCell] = useState<CellInfo | null>(null)
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null)
  const [focusPoint, setFocusPoint] = useState<[number, number, number] | null>(null)
  const showFrustum = useSyncExternalStore(
    subscribeCameraFrustum,
    getShowCameraFrustum,
    getShowCameraFrustum,
  )
  const consumeCamera = useCallback(() => setCameraCommand(null), [])

  useEffect(() => {
    return subscribeAgvCameraView((deviceId) => {
      onSelectDevice(deviceId)
      setCameraCommand("follow")
      consumeAgvCameraView()
    })
  }, [onSelectDevice])

  useEffect(() => {
    return subscribeFocusDetection(() => {
      const point = consumeFocusDetection()
      if (!point) return
      setFocusPoint([point.x, point.y, point.z])
      setCameraCommand("focus")
    })
  }, [])

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
        <label className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px]">
          <input
            type="checkbox"
            checked={showFrustum}
            onChange={(event) => setShowCameraFrustum(event.target.checked)}
          />
          Show camera frustum
        </label>
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
              onSelectDevice={(deviceId) => {
                if (deviceId) onSelectPerson(null)
                onSelectDevice(deviceId)
              }}
              selectedPersonId={selectedPersonId}
              onSelectPerson={onSelectPerson}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
              darkMode={darkMode}
              cameraCommand={cameraCommand}
              focusPoint={focusPoint}
              onCameraConsumed={consumeCamera}
            />
          </WarehouseGeometryProvider>
        </Canvas>
      </div>
      <TwinPerfHud enabled={DEV_PERF} />
      {selectedCell && selectedRack && (
        <div className="absolute bottom-8 left-2 max-w-sm space-y-1 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm">
          <p className="font-semibold">{cellCaption(selectedCell)}</p>
          <InspectorRow label="Rack ID" value={selectedRack.code} />
          <InspectorRow label="Block" value={selectedRack.blockId ?? "—"} />
          <InspectorRow label="Side" value={selectedRack.side ?? "—"} />
          <InspectorRow label="Levels" value={String(selectedRack.levels)} />
          <InspectorRow label="Total cells" value={String(rackTotal)} />
          <InspectorRow label="Occupied cells" value={String(rackOccupied)} />
          <InspectorRow label="Occupancy %" value={`${rackOccupancyPct}%`} />
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

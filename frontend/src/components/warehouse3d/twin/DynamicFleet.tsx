import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { memo, useMemo, useRef } from "react"
import { type Group, MathUtils, Vector3 } from "three"
import { taskKindLabel } from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { DeviceKind, SimTask } from "@/components/deviceServer/simTypes.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { PalletLoad } from "@/components/warehouse3d/PalletRackVisuals.tsx"
import { palletCargoVariant } from "@/components/warehouse3d/palletRackLayout.ts"
import { AGVModel } from "@/components/warehouse3d/twin/AGVModel.tsx"
import { ForkliftModel } from "@/components/warehouse3d/twin/ForkliftModel.tsx"
import { TruckModel } from "@/components/warehouse3d/twin/TruckModel.tsx"
import {
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

const MOBILE_KINDS: DeviceKind[] = ["forklift", "agv", "amr"]

function deviceColor(kind: DeviceKind, status: string, online: boolean, alarm: boolean) {
  if (!online) return "#94a3b8"
  if (status === "fault" || status === "jam") return "#ef4444"
  if (alarm) return "#f59e0b"
  if (status === "charging") return "#d97706"
  if (status === "waiting") return "#f97316"
  if (kind === "forklift") return "#f59e0b"
  if (kind === "agv") return "#0ea5e9"
  if (kind === "amr") return "#8b5cf6"
  return "#64748b"
}

function LiveMobile({
  id,
  kind,
  name,
  selected,
  task,
  onSelect,
}: {
  id: string
  kind: DeviceKind
  name: string
  selected: boolean
  task: SimTask | undefined
  onSelect: () => void
}) {
  const group = useRef<Group>(null)
  const load = useRef<Group>(null)
  const current = useRef(new Vector3())
  const heading = useRef(0)
  const inited = useRef(false)
  const color = deviceColor(kind, "idle", true, false)

  useFrame((_, dt) => {
    const device = deviceSimulation
      .getMotionSnapshot()
      .devices.find((item) => item.id === id)
    const node = group.current
    if (!device || !node) return
    const tx = planToWorldX(device.x)
    const tz = planToWorldZ(device.z)
    if (!inited.current) {
      current.current.set(tx, 0, tz)
      inited.current = true
    }
    const dx = tx - current.current.x
    const dz = tz - current.current.z
    if (Math.abs(dx) + Math.abs(dz) > 0.04) {
      heading.current = Math.atan2(dx, dz)
    }
    current.current.x = MathUtils.damp(current.current.x, tx, 10, dt)
    current.current.z = MathUtils.damp(current.current.z, tz, 10, dt)
    node.position.copy(current.current)
    node.rotation.y = MathUtils.damp(node.rotation.y, heading.current, 8, dt)
    if (load.current) load.current.visible = device.carrying
  })

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      {kind === "forklift" ? (
        <ForkliftModel color={color} carrying={false} selected={selected} />
      ) : (
        <AGVModel
          color={color}
          carrying={false}
          selected={selected}
          kind={kind === "amr" ? "amr" : "agv"}
        />
      )}
      <group
        ref={load}
        visible={false}
        position={[
          0,
          kind === "forklift" ? 0.48 : 0.58,
          kind === "forklift" ? 1.2 : 0,
        ]}
      >
        <PalletLoad
          variant={palletCargoVariant(`carry-${id}`)}
          maxHeight={0.7}
          lanes={1}
        />
      </group>
      {selected && (
        <Html
          position={[0, kind === "forklift" ? 2.15 : 1.45, 0]}
          center
          distanceFactor={36}
          zIndexRange={[10, 0]}
        >
          <div className="whitespace-nowrap rounded-sm bg-background px-1 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
            {name}
            {task ? ` · ${taskKindLabel(task.kind)}` : ""}
          </div>
        </Html>
      )}
    </group>
  )
}

function LiveTruck({
  id,
  plate,
  direction,
  darkMode,
}: {
  id: string
  plate: string
  direction: "inbound" | "outbound"
  darkMode?: boolean
}) {
  const group = useRef<Group>(null)
  const inited = useRef(false)
  const current = useRef(new Vector3())

  useFrame((_, dt) => {
    const truck = deviceSimulation
      .getMotionSnapshot()
      .trucks.find((item) => item.id === id)
    const node = group.current
    if (!truck || !node) return
    const tx = planToWorldX(truck.x)
    const tz = planToWorldZ(truck.z)
    if (!inited.current) {
      current.current.set(tx, 0, tz)
      inited.current = true
    }
    current.current.x = MathUtils.damp(current.current.x, tx, 8, dt)
    current.current.z = MathUtils.damp(current.current.z, tz, 8, dt)
    node.position.copy(current.current)
  })

  return (
    <group ref={group}>
      <TruckModel plate={plate} direction={direction} darkMode={darkMode} />
    </group>
  )
}

export const DynamicFleet = memo(function DynamicFleet({
  selectedDeviceId,
  onSelectDevice,
  darkMode,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  darkMode?: boolean
}) {
  const data = useSimData()
  const mobileList = useMemo(
    () =>
      data.devices
        .filter((device) => MOBILE_KINDS.includes(device.kind))
        .map((device) => ({ id: device.id, kind: device.kind, name: device.name })),
    [data.devices],
  )
  const tasksByDevice = useMemo(() => {
    const map = new Map<string, SimTask>()
    for (const task of data.tasks) {
      if (!task.deviceId || task.status === "done") continue
      map.set(task.deviceId, task)
    }
    return map
  }, [data.tasks])
  const trucks = useMemo(
    () =>
      data.trucks.map((truck) => ({
        id: truck.id,
        plate: truck.plate,
        direction: truck.direction,
      })),
    [data.trucks],
  )

  return (
    <group>
      {mobileList.map((device) => (
        <LiveMobile
          key={device.id}
          id={device.id}
          kind={device.kind}
          name={device.name}
          selected={device.id === selectedDeviceId}
          task={tasksByDevice.get(device.id)}
          onSelect={() =>
            onSelectDevice(device.id === selectedDeviceId ? null : device.id)
          }
        />
      ))}
      {trucks.map((truck) => (
        <LiveTruck
          key={truck.id}
          id={truck.id}
          plate={truck.plate}
          direction={truck.direction}
          darkMode={darkMode}
        />
      ))}
    </group>
  )
})

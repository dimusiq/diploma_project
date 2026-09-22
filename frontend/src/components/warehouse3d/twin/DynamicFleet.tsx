import { Html } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { CameraHelper, type Group, MathUtils, PerspectiveCamera, Vector3 } from "three"
import {
  getAgvCamera,
  getShowCameraFrustum,
  registerAgvCamera,
  subscribeCameraFrustum,
} from "@/components/digitalTwin/agvCameraBridge.ts"
import { AGV_CAMERA_LOCAL } from "@/components/digitalTwin/sceneDetection.ts"
import { taskKindLabel } from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { DeviceKind, SimTask } from "@/components/deviceServer/simTypes.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { PalletLoad } from "@/components/warehouse3d/PalletRackVisuals.tsx"
import { palletCargoVariant } from "@/components/warehouse3d/palletRackLayout.ts"
import { AGVModel } from "@/components/warehouse3d/twin/AGVModel.tsx"
import { ForkliftModel } from "@/components/warehouse3d/twin/ForkliftModel.tsx"
import { TruckModel } from "@/components/warehouse3d/twin/TruckModel.tsx"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
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
  hasCamera,
  obstacle,
  held,
  palletConfidence,
  onSelect,
}: {
  id: string
  kind: DeviceKind
  name: string
  selected: boolean
  task: SimTask | undefined
  hasCamera: boolean
  obstacle: boolean
  held: boolean
  palletConfidence: number | null
  onSelect: () => void
}) {
  const group = useRef<Group>(null)
  const load = useRef<Group>(null)
  const current = useRef(new Vector3())
  const heading = useRef(0)
  const inited = useRef(false)
  const showFrustum = useSyncExternalStore(subscribeCameraFrustum, getShowCameraFrustum, getShowCameraFrustum)
  const helperRef = useRef<CameraHelper | null>(null)
  const { scene } = useThree()
  const color = deviceColor(kind, "idle", true, false)
  const detectClass = kind === "forklift" ? "forklift" : kind === "amr" ? "amr" : "agv"

  useLayoutEffect(() => {
    if (!hasCamera || !group.current) return
    const camera = new PerspectiveCamera(55, 640 / 360, 0.12, 40)
    camera.name = "agv-smart-camera"
    camera.position.set(...AGV_CAMERA_LOCAL.position)
    camera.rotation.y = AGV_CAMERA_LOCAL.rotationY
    group.current.add(camera)
    registerAgvCamera(id, camera)
    return () => {
      group.current?.remove(camera)
      registerAgvCamera(id, null)
    }
  }, [hasCamera, id])

  useEffect(() => {
    if (!hasCamera || !showFrustum) return
    const camera = getAgvCamera(id)
    if (!camera) return
    const helper = new CameraHelper(camera)
    helperRef.current = helper
    scene.add(helper)
    return () => {
      helperRef.current = null
      scene.remove(helper)
      helper.dispose()
    }
  }, [hasCamera, id, scene, showFrustum])

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
    helperRef.current?.update()
  })

  return (
    <group
      ref={group}
      userData={{
        detect: {
          className: detectClass,
          entityType: "device",
          entityId: id,
          half: { x: 0.7, y: 0.7, z: 1.1 },
          center: { x: 0, y: 0.55, z: 0 },
        },
      }}
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
        {palletConfidence != null ? (
          <Html position={[0, 0.9, 0]} center distanceFactor={28} zIndexRange={[11, 0]}>
            <span className="rounded-sm bg-black/80 px-1 font-mono text-[10px] text-emerald-200">
              PALLET {palletConfidence.toFixed(2)}
            </span>
          </Html>
        ) : null}
      </group>
      {hasCamera && showFrustum ? (
        <mesh
          geometry={TWIN_GEOM.frustum}
          material={obstacle ? TWIN_MAT.frustumAlert : TWIN_MAT.frustum}
          position={[0, 0.55, 0.95]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ) : null}
      {hasCamera ? (
        <Html position={[0, 1.7, 0.2]} center distanceFactor={28} zIndexRange={[12, 0]}>
          <span className="rounded-sm bg-black/75 px-1 font-mono text-[10px] text-white">
            📷{held ? " HOLD" : ""}
          </span>
        </Html>
      ) : null}
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
    <group
      ref={group}
      userData={{
        detect: {
          className: "truck",
          entityType: "truck",
          entityId: id,
          half: { x: 1.3, y: 1.5, z: 3 },
          center: { x: 0, y: 1.4, z: 0 },
        },
      }}
    >
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
  const cameraById = useMemo(() => {
    const map = new Map<string, { obstacle: boolean; held: boolean; palletConfidence: number | null }>()
    for (const device of data.devices) {
      if (!device.camera?.installed) continue
      const pallet = device.palletId
        ? device.camera.detections?.find((item) => item.class_name === "pallet")
        : undefined
      map.set(device.id, {
        obstacle: Boolean(device.camera.obstacle),
        held: Boolean(device.cameraHold),
        palletConfidence: pallet ? pallet.confidence : null,
      })
    }
    return map
  }, [data.devices])
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
          hasCamera={cameraById.has(device.id)}
          obstacle={cameraById.get(device.id)?.obstacle ?? false}
          held={cameraById.get(device.id)?.held ?? false}
          palletConfidence={cameraById.get(device.id)?.palletConfidence ?? null}
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

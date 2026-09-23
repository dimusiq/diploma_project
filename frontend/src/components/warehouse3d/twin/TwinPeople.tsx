import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { memo, useEffect, useRef } from "react"
import type { Group } from "three"
import { MathUtils } from "three"
import { cameraDebugEnabled } from "@/components/digitalTwin/agvCameraBridge.ts"
import { crewPlanPosition } from "@/components/digitalTwin/twinPeoplePose.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { WorkerMotion } from "@/components/deviceServer/simStore.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
import {
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

const DETECT = {
  className: "person",
  entityType: "worker",
  sceneRole: "dynamic_entity",
  half: { x: 0.28, y: 0.85, z: 0.22 },
  center: { x: 0, y: 0.9, z: 0 },
} as const

function tracePerson(stage: string, entityId: string, objectUuid: string, position: { x: number; y: number; z: number }): void {
  if (!cameraDebugEnabled()) return
  console.info(
    `[PERSON TRACE] stage=${stage} entityId=${entityId} objectUuid=${objectUuid} worldPosition=(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) source=twin-worker`,
  )
}

function PersonMesh({
  id,
  index,
  selected,
  onSelect,
}: {
  id: string
  index: number
  selected: boolean
  onSelect?: (id: string) => void
}) {
  const group = useRef<Group>(null)
  const labelRef = useRef<HTMLButtonElement>(null)
  const heading = useRef(0)
  const inited = useRef(false)
  const traced = useRef(false)

  useEffect(() => {
    const node = group.current
    return () => {
      if (node) tracePerson("DESPAWN", id, node.uuid, node.position)
    }
  }, [id])

  useFrame(({ clock }, dt) => {
    const node = group.current
    if (!node) return
    const snapshot = deviceSimulation.getMotionSnapshot()
    const motion = snapshot.workers?.find((item) => item.id === id)
    const pose = motion ?? fallbackPose(id, index)
    const tx = planToWorldX(pose.x)
    const tz = planToWorldZ(pose.z)
    if (!inited.current) {
      node.position.set(tx, 0, tz)
      inited.current = true
    }
    const dx = tx - node.position.x
    const dz = tz - node.position.z
    if (Math.abs(dx) + Math.abs(dz) > 0.04) {
      heading.current = Math.atan2(dx, dz)
    } else if (motion && Math.abs(motion.heading) > 0.01) {
      heading.current = motion.heading
    }
    node.position.x = MathUtils.damp(node.position.x, tx, 10, dt)
    node.position.z = MathUtils.damp(node.position.z, tz, 10, dt)
    const walking = snapshot.running && (motion?.status ?? "") === "walking" && (motion?.speed ?? 0) > 0.05
    node.position.y = walking ? Math.sin(clock.elapsedTime * 8) * 0.035 : 0
    node.rotation.y = MathUtils.damp(node.rotation.y, heading.current, 8, dt)
    if (labelRef.current && motion) {
      const title = motion.displayName ?? motion.code ?? motion.name
      labelRef.current.textContent = `${title} ${motion.speed.toFixed(1)} m/s → ${motion.target ?? motion.status}`
    }
    if (!traced.current) {
      traced.current = true
      tracePerson("SCENE_ADD", id, node.uuid, node.position)
    }
  })

  return (
    <group
      ref={group}
      userData={{
        detect: { ...DETECT, entityId: id },
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(id)
      }}
    >
      {selected ? (
        <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.safetyYellow} position={[0, 0.02, 0]} scale={[0.7, 0.02, 0.7]} />
      ) : null}
      <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.cabinBlue} position={[0, 0.85, 0]} scale={[0.42, 1.15, 0.28]} />
      <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.safetyYellow} position={[0, 1.15, 0.02]} scale={[0.46, 0.38, 0.3]} />
      <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.darkMetal} position={[0, 1.62, 0]} scale={[0.22, 0.22, 0.22]} />
      <Html position={[0, 2.05, 0]} center distanceFactor={42} zIndexRange={[8, 0]} style={{ pointerEvents: "auto" }}>
        <button
          type="button"
          ref={labelRef}
          className="cursor-pointer whitespace-nowrap rounded-sm bg-black/70 px-1 font-mono text-[10px] text-white"
          onClick={(event) => {
            event.stopPropagation()
            onSelect?.(id)
          }}
        />
      </Html>
    </group>
  )
}

function fallbackPose(id: string, index: number): WorkerMotion {
  const plan = crewPlanPosition(index)
  return {
    id,
    name: id,
    x: plan.x,
    z: plan.z,
    heading: plan.heading,
    speed: 0,
    status: "idle",
    target: null,
  }
}

export const TwinPeople = memo(function TwinPeople({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const data = useSimData()
  const workers = data.workers.filter((worker) => worker.pos && worker.spawned !== false).slice(0, 8)
  return (
    <group>
      {workers.map((worker, index) => (
        <PersonMesh
          key={worker.id}
          id={worker.id}
          index={index}
          selected={selectedId === worker.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
})

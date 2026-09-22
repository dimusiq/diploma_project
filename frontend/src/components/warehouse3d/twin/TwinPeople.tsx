import { useFrame } from "@react-three/fiber"
import { memo, useRef } from "react"
import type { Group } from "three"
import { getAgvCamera } from "@/components/digitalTwin/agvCameraBridge.ts"
import {
  aisleWalkerOffset,
  crewPlanPosition,
  isAisleWalker,
  offsetFromHeading,
} from "@/components/digitalTwin/twinPeoplePose.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
import {
  planToWorldX,
  planToWorldZ,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

const DETECT = {
  className: "person",
  entityType: "worker",
  half: { x: 0.28, y: 0.85, z: 0.22 },
  center: { x: 0, y: 0.9, z: 0 },
} as const

function PersonMesh({ id, index }: { id: string; index: number }) {
  const group = useRef<Group>(null)
  const walker = isAisleWalker(id)

  useFrame(() => {
    const node = group.current
    if (!node) return
    if (walker) {
      const timeSec = deviceSimulation.getDataSnapshot().timeSec
      const offset = aisleWalkerOffset(timeSec)
      const camera = getAgvCamera("agv-1")
      const parent = camera?.parent
      let originX = 0
      let originZ = 0
      let heading = 0
      if (parent) {
        parent.updateWorldMatrix(true, false)
        originX = parent.position.x
        originZ = parent.position.z
        heading = parent.rotation.y
      } else {
        const agv = deviceSimulation.getMotionSnapshot().devices.find((item) => item.id === "agv-1")
        if (!agv) return
        originX = planToWorldX(agv.x)
        originZ = planToWorldZ(agv.z)
      }
      const delta = offsetFromHeading(heading, offset.forward, offset.side)
      node.position.set(originX + delta.x, 0, originZ + delta.z)
      node.rotation.y = heading + Math.PI
      return
    }
    const pose = crewPlanPosition(index)
    node.position.set(planToWorldX(pose.x), 0, planToWorldZ(pose.z))
    node.rotation.y = pose.heading
  })

  return (
    <group
      ref={group}
      userData={{
        detect: { ...DETECT, entityId: id },
      }}
    >
      <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.cabinBlue} position={[0, 0.85, 0]} scale={[0.42, 1.15, 0.28]} />
      <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.safetyYellow} position={[0, 1.15, 0.02]} scale={[0.46, 0.38, 0.3]} />
      <mesh geometry={TWIN_GEOM.box} material={TWIN_MAT.darkMetal} position={[0, 1.62, 0]} scale={[0.22, 0.22, 0.22]} />
    </group>
  )
}

export const TwinPeople = memo(function TwinPeople() {
  const data = useSimData()
  const workers = data.workers.slice(0, 8)
  return (
    <group>
      {workers.map((worker, index) => (
        <PersonMesh key={worker.id} id={worker.id} index={index} />
      ))}
    </group>
  )
})

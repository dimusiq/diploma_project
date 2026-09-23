import { useFrame } from "@react-three/fiber"
import { useRef } from "react"
import type { Mesh } from "three"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { SimDock } from "@/components/deviceServer/simTypes.ts"
import { SafetyBollard } from "@/components/warehouse3d/twin/SafetyBarrier.tsx"
import {
  DOCK_DOOR_WIDTH,
  DOCK_FRAME_WIDTH,
  DOCK_GATE_HEIGHT,
  DOCK_GATE_TOP,
  DOCK_HEADER_H,
  DOCK_INNER_FACE_Z,
  DOCK_JAMB_W,
  dockBollardLocals,
  dockHazardLocal,
  dockWorldPose,
  TWIN_WALL_HEIGHT,
  TWIN_WALL_THICKNESS,
} from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

const DOOR_THICKNESS = 0.05
const OPEN_LIFT = 2.4
const LINTEL_TUCK = 0.012

function DockDoor({ dockId }: { dockId: string }) {
  const ref = useRef<Mesh>(null)
  const closed = DOCK_GATE_HEIGHT + LINTEL_TUCK
  const top = DOCK_GATE_TOP + LINTEL_TUCK
  useFrame(() => {
    const door = deviceSimulation
      .getMotionSnapshot()
      .devices.find((device) => device.id === dockId)
    const lift = door?.status === "occupied" ? OPEN_LIFT : 0
    const height = Math.max(0.2, closed - lift)
    const node = ref.current
    if (!node) return
    node.scale.y = height
    node.position.y = top - height / 2
  })
  return (
    <mesh
      ref={ref}
      geometry={TWIN_GEOM.box}
      material={TWIN_MAT.gate}
      position={[0, top - closed / 2, DOCK_INNER_FACE_Z - DOOR_THICKNESS / 2]}
      scale={[DOCK_DOOR_WIDTH, closed, DOOR_THICKNESS]}
    />
  )
}

function DockFrame() {
  const jambX = (DOCK_FRAME_WIDTH - DOCK_JAMB_W) / 2
  return (
    <group>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.gateFrame}
        position={[-jambX, TWIN_WALL_HEIGHT / 2, 0]}
        scale={[DOCK_JAMB_W, TWIN_WALL_HEIGHT, TWIN_WALL_THICKNESS]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.gateFrame}
        position={[jambX, TWIN_WALL_HEIGHT / 2, 0]}
        scale={[DOCK_JAMB_W, TWIN_WALL_HEIGHT, TWIN_WALL_THICKNESS]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.gateFrame}
        position={[0, TWIN_WALL_HEIGHT - DOCK_HEADER_H / 2, 0]}
        scale={[DOCK_FRAME_WIDTH, DOCK_HEADER_H, TWIN_WALL_THICKNESS]}
      />
    </group>
  )
}

function DockHazard() {
  const hazard = dockHazardLocal()
  return (
    <group>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0.012, hazard.centerZ]}
        scale={[hazard.width, 0.012, hazard.depth]}
      />
      {hazard.stripeXs.map((x) => (
        <mesh
          key={x}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.safetyBlack}
          position={[x, 0.02, hazard.centerZ]}
          scale={[0.22, 0.008, hazard.depth - 0.12]}
        />
      ))}
    </group>
  )
}

export function DockModel({ dock }: { dock: SimDock; darkMode?: boolean }) {
  const pose = dockWorldPose(dock)
  const bollards = dockBollardLocals()
  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.rotationY, 0]}>
      <DockHazard />
      {bollards.map((position) => (
        <SafetyBollard key={position.join(",")} position={position} />
      ))}
      <DockFrame />
      <DockDoor dockId={dock.id} />
    </group>
  )
}

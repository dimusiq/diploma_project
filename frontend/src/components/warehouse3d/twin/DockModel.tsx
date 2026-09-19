import { useFrame } from "@react-three/fiber"
import { useRef } from "react"
import type { Mesh } from "three"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { SimDock } from "@/components/deviceServer/simTypes.ts"
import { SafetyBollard } from "@/components/warehouse3d/twin/SafetyBarrier.tsx"
import {
  DOCK_DOOR_WIDTH,
  DOCK_FRAME_WIDTH,
  dockWorldPose,
  TWIN_WALL_HEIGHT,
  TWIN_WALL_THICKNESS,
} from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

const JAMB_W = 0.22
const HEADER_H = 0.36
const DOOR_CLOSED_H = 3.2
const FACADE_EPS = 0.02

function DockDoor({ dockId }: { dockId: string }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const door = deviceSimulation
      .getMotionSnapshot()
      .devices.find((device) => device.id === dockId)
    const lift = door?.status === "occupied" ? 2.4 : 0.15
    const node = ref.current
    if (!node) return
    node.position.y = 0.36 + (DOOR_CLOSED_H - lift) / 2
    node.scale.y = Math.max(0.2, DOOR_CLOSED_H - lift)
  })
  return (
    <mesh
      ref={ref}
      geometry={TWIN_GEOM.box}
      material={TWIN_MAT.darkMetal}
      position={[0, 0.36 + DOOR_CLOSED_H / 2, FACADE_EPS]}
      scale={[DOCK_DOOR_WIDTH, DOOR_CLOSED_H, 0.08]}
    />
  )
}

function DockFrame({ darkMode }: { darkMode?: boolean }) {
  const mat = darkMode ? TWIN_MAT.wallDark : TWIN_MAT.steel
  const jambX = (DOCK_FRAME_WIDTH - JAMB_W) / 2
  return (
    <group>
      <mesh
        geometry={TWIN_GEOM.box}
        material={mat}
        position={[-jambX, TWIN_WALL_HEIGHT / 2, 0]}
        scale={[JAMB_W, TWIN_WALL_HEIGHT, TWIN_WALL_THICKNESS]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={mat}
        position={[jambX, TWIN_WALL_HEIGHT / 2, 0]}
        scale={[JAMB_W, TWIN_WALL_HEIGHT, TWIN_WALL_THICKNESS]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={mat}
        position={[0, TWIN_WALL_HEIGHT - HEADER_H / 2, 0]}
        scale={[DOCK_FRAME_WIDTH, HEADER_H, TWIN_WALL_THICKNESS]}
      />
    </group>
  )
}

export function DockModel({
  dock,
  darkMode,
}: {
  dock: SimDock
  darkMode?: boolean
}) {
  const pose = dockWorldPose(dock)
  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.rotationY, 0]}>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.darkMetal}
        position={[0, 0.18, -1.15]}
        scale={[3.6, 0.36, 2.3]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0.02, -2.35]}
        scale={[3.8, 0.02, 2.5]}
      />
      {[-1.1, -0.35, 0.35, 1.1].map((x) => (
        <mesh
          key={x}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.safetyBlack}
          position={[x, 0.025, -2.35]}
          scale={[0.28, 0.012, 2.3]}
        />
      ))}
      <DockFrame darkMode={darkMode} />
      <DockDoor dockId={dock.id} />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, TWIN_WALL_HEIGHT - HEADER_H / 2, 0.12]}
        scale={[0.22, 0.12, 0.12]}
      />
      <SafetyBollard position={[-1.9, 0, -1.2]} />
      <SafetyBollard position={[1.9, 0, -1.2]} />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0.02, -3.55]}
        scale={[1.4, 0.01, 0.4]}
      />
    </group>
  )
}

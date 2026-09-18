import { useFrame } from "@react-three/fiber"
import { useRef } from "react"
import type { Mesh } from "three"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { SimDock } from "@/components/deviceServer/simTypes.ts"
import { SafetyBollard } from "@/components/warehouse3d/twin/SafetyBarrier.tsx"
import { dockWorldPose } from "@/components/warehouse3d/twin/twinLayout.ts"
import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"

function DockDoor({ dockId }: { dockId: string }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const door = deviceSimulation
      .getMotionSnapshot()
      .devices.find((device) => device.id === dockId)
    const lift = door?.status === "occupied" ? 2.4 : 0.15
    const node = ref.current
    if (!node) return
    node.position.y = 1.7 + lift / 2
    node.scale.y = Math.max(0.2, 3.2 - lift)
  })
  return (
    <mesh
      ref={ref}
      geometry={TWIN_GEOM.box}
      material={TWIN_MAT.darkMetal}
      position={[0, 1.7, 0.02]}
      scale={[3.05, 3.05, 0.08]}
    />
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
        position={[0, 0.18, 0]}
        scale={[3.6, 0.36, 2.2]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0.02, 1.4]}
        scale={[3.8, 0.02, 2.6]}
      />
      {[-1.1, -0.35, 0.35, 1.1].map((x) => (
        <mesh
          key={x}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.safetyBlack}
          position={[x, 0.025, 1.4]}
          scale={[0.28, 0.012, 2.4]}
        />
      ))}
      <mesh
        geometry={TWIN_GEOM.box}
        material={darkMode ? TWIN_MAT.wallDark : TWIN_MAT.steel}
        position={[0, 2.1, -0.08]}
        scale={[3.4, 4.2, 0.16]}
      />
      <DockDoor dockId={dock.id} />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.steel}
        position={[0, 3.7, 0.12]}
        scale={[0.22, 0.12, 0.12]}
      />
      <SafetyBollard position={[-1.9, 0, 1.1]} />
      <SafetyBollard position={[1.9, 0, 1.1]} />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0.02, 2.6]}
        scale={[1.4, 0.01, 0.4]}
      />
    </group>
  )
}

import { Line } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import type { Group, Vector3 } from "three"
import {
  type WarehouseEquipmentKind,
  WarehouseEquipmentMesh,
} from "@/components/warehouse3d/WarehouseEquipmentModels.tsx"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import { stagingPointOnFloor } from "@/components/warehouse3d/warehouseAisleRouting.ts"
import { useWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"
import {
  polylineLength,
  samplePolyline3D,
} from "@/components/warehouse3d/warehousePathFollow.ts"

export const ROUTE_FLOOR_Y = 0.22

const ROUTE_LINE_COLOR = "#ea580c"
export function RoutePathLayer({
  pathPoints,
  cellWaypoints,
}: {
  pathPoints: Vector3[]
  cellWaypoints: CellInfo[]
}) {
  const geom = useWarehouseGeometry()
  const cellMarkers = useMemo(() => {
    return cellWaypoints.map((w) =>
      stagingPointOnFloor(geom, w, ROUTE_FLOOR_Y),
    )
  }, [geom, cellWaypoints])
  if (cellWaypoints.length === 0) return null
  return (
    <group>
      {cellMarkers.map((p, i) => (
        <mesh key={i} position={[p.x, p.y + 0.04, p.z]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial
            color="#fb923c"
            emissive="#c2410c"
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}
      {pathPoints.length >= 2 && (
        <Line points={pathPoints} color={ROUTE_LINE_COLOR} lineWidth={2.5} />
      )}
    </group>
  )
}

export function SimulationEquipmentAlongRoute({
  pathPoints,
  active,
  speed,
  equipmentKind,
  showCargo,
  onComplete,
}: {
  pathPoints: Vector3[]
  active: boolean
  speed: number
  equipmentKind: WarehouseEquipmentKind
  showCargo: boolean
  onComplete?: () => void
}) {
  const groupRef = useRef<Group>(null)
  const tRef = useRef(0)
  const doneRef = useRef(false)
  const lengthRef = useRef(1)

  useEffect(() => {
    lengthRef.current = Math.max(polylineLength(pathPoints), 0.05)
  }, [pathPoints])

  useEffect(() => {
    if (active) {
      tRef.current = 0
      doneRef.current = false
    }
  }, [active])

  useFrame((state, delta) => {
    if (!active || pathPoints.length < 2 || !groupRef.current) return
    const len = lengthRef.current
    tRef.current += (speed * delta) / len
    state.invalidate()
    if (tRef.current >= 1) {
      tRef.current = 1
      if (!doneRef.current) {
        doneRef.current = true
        onComplete?.()
      }
    }
    const { position, headingY } = samplePolyline3D(pathPoints, tRef.current)
    groupRef.current.position.copy(position)
    groupRef.current.rotation.set(0, headingY, 0)
  })

  if (pathPoints.length < 2) return null
  return (
    <group ref={groupRef}>
      <WarehouseEquipmentMesh
        kind={equipmentKind}
        showPallet={showCargo && (equipmentKind === "forklift" || equipmentKind === "reach_truck")}
      />
    </group>
  )
}

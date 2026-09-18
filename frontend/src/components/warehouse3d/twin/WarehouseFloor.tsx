import { TWIN_GEOM, TWIN_MAT } from "@/components/warehouse3d/twin/twinMaterials.ts"
import {
  FLOOR_PLAN_AISLE_Z,
  FLOOR_PLAN_CORRIDOR_X,
  getFloorPlanRacks,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"

function ExpansionJoints({ darkMode }: { darkMode?: boolean }) {
  const lines: Array<{ x: number; z: number; w: number; d: number }> = []
  const spanX = WAREHOUSE_WIDTH + 8
  const spanZ = WAREHOUSE_DEPTH + 8
  for (let x = -spanX / 2; x <= spanX / 2; x += 8) {
    lines.push({ x, z: 0, w: 0.04, d: spanZ })
  }
  for (let z = -spanZ / 2; z <= spanZ / 2; z += 8) {
    lines.push({ x: 0, z, w: spanX, d: 0.04 })
  }
  const mat = darkMode ? TWIN_MAT.concreteDark : TWIN_MAT.asphalt
  return (
    <>
      {lines.map((line, i) => (
        <mesh
          key={`joint-${i}`}
          geometry={TWIN_GEOM.box}
          material={mat}
          position={[line.x, 0.012, line.z]}
          scale={[line.w, 0.004, line.d]}
        />
      ))}
    </>
  )
}

function FloorArrow({
  x,
  z,
  rotationY,
}: {
  x: number
  z: number
  rotationY: number
}) {
  return (
    <group position={[x, 0.018, z]} rotation={[0, rotationY, 0]}>
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0, 0.15]}
        scale={[0.22, 0.006, 0.7]}
      />
      <mesh
        geometry={TWIN_GEOM.box}
        material={TWIN_MAT.safetyYellow}
        position={[0, 0, 0.52]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[0.18, 0.006, 0.18]}
      />
    </group>
  )
}

function PedestrianCrossing({
  x,
  z,
  rotationY,
  width = 3.2,
}: {
  x: number
  z: number
  rotationY: number
  width?: number
}) {
  const stripes = 7
  return (
    <group position={[x, 0.016, z]} rotation={[0, rotationY, 0]}>
      {Array.from({ length: stripes }, (_, i) => {
        const oz = -width / 2 + (i + 0.5) * (width / stripes)
        return (
          <mesh
            key={i}
            geometry={TWIN_GEOM.box}
            material={TWIN_MAT.safetyYellow}
            position={[0, 0, oz]}
            scale={[1.6, 0.005, 0.22]}
          />
        )
      })}
    </group>
  )
}

export function WarehouseFloor({ darkMode }: { darkMode?: boolean }) {
  const racks = getFloorPlanRacks()
  const minX = Math.min(...racks.map((rack) => rack.x))
  const maxX = Math.max(...racks.map((rack) => rack.x + rack.w))
  const span = Math.max(8, maxX - minX)

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[WAREHOUSE_WIDTH + 44, WAREHOUSE_DEPTH + 28]} />
        <meshStandardMaterial
          color={darkMode ? "#7c766f" : "#c4bfb6"}
          roughness={0.9}
          metalness={0.04}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <planeGeometry args={[WAREHOUSE_WIDTH, WAREHOUSE_DEPTH]} />
        <meshStandardMaterial
          color={darkMode ? "#8d877e" : "#d0cbc2"}
          roughness={0.88}
          metalness={0.03}
        />
      </mesh>
      <ExpansionJoints darkMode={darkMode} />

      {FLOOR_PLAN_AISLE_Z.map((planZ, ai) => {
        const wz = planToWorldZ(planZ)
        return (
          <group key={`aisle-${ai}`}>
            <mesh
              geometry={TWIN_GEOM.box}
              material={TWIN_MAT.safetyYellow}
              position={[planToWorldX((minX + maxX) / 2), 0.015, wz]}
              scale={[span, 0.006, 0.08]}
            />
            {Array.from({ length: 5 }, (_, si) => {
              const t = (si + 0.5) / 5
              return (
                <FloorArrow
                  key={si}
                  x={planToWorldX(minX + t * span)}
                  z={wz + (ai % 2 === 0 ? 0.35 : -0.35)}
                  rotationY={ai % 2 === 0 ? Math.PI / 2 : -Math.PI / 2}
                />
              )
            })}
          </group>
        )
      })}

      {FLOOR_PLAN_CORRIDOR_X.map((planX, ci) => (
        <mesh
          key={`corr-${ci}`}
          geometry={TWIN_GEOM.box}
          material={TWIN_MAT.safetyYellow}
          position={[planToWorldX(planX), 0.015, 0]}
          scale={[0.1, 0.006, WAREHOUSE_DEPTH - 6]}
        />
      ))}

      <PedestrianCrossing
        x={planToWorldX(14)}
        z={planToWorldZ(18)}
        rotationY={Math.PI / 2}
      />
      <PedestrianCrossing
        x={planToWorldX(90)}
        z={planToWorldZ(38)}
        rotationY={Math.PI / 2}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[planToWorldX(-12), 0.004, 0]}
      >
        <planeGeometry args={[16, WAREHOUSE_DEPTH]} />
        <meshStandardMaterial
          color={darkMode ? "#44403c" : "#78716c"}
          roughness={0.95}
          metalness={0.02}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[planToWorldX(116), 0.004, 0]}
      >
        <planeGeometry args={[16, WAREHOUSE_DEPTH]} />
        <meshStandardMaterial
          color={darkMode ? "#44403c" : "#78716c"}
          roughness={0.95}
          metalness={0.02}
        />
      </mesh>
    </group>
  )
}

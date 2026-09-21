/**
 * Слои digital twin: зоны топологии, проходы, граф маршрутов, маркеры техники.
 */
import { Html, Line, Text } from "@react-three/drei"
import { useMemo } from "react"
import { Vector3 } from "three"
import type { RouteGraphResponse } from "@/api/warehouseRouteGraph.ts"
import type {
  TopologyDocument,
  TopologyStorageZone,
} from "@/api/warehouseTopology.ts"
import {
  normXZToWorldFloor,
  routeNodeToWorldFloor,
} from "@/components/warehouse3d/twin3dCoordinates.ts"
import {
  equipmentTypeToKind,
  WarehouseEquipmentMesh,
} from "@/components/warehouse3d/WarehouseEquipmentModels.tsx"
import {
  CELL_SIZE,
  LEVEL_HEIGHT,
  useWarehouseGeometry,
  type WarehouseGeometry,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import type { LiveEquipmentPose } from "@/hooks/useEquipmentPositionsLive.ts"
import { getEquipmentStatusLabel } from "@/lib/statusLabels.ts"

export type TwinEquipmentMarker = {
  id: string
  name: string
  kind: string
  current_status: string
}

function zoneAabb(
  geom: WarehouseGeometry,
  z: TopologyStorageZone,
): {
  center: [number, number, number]
  size: [number, number, number]
} | null {
  const r0 = z.row_from_1based - 1
  const r1 = z.row_to_1based - 1
  const cx0 = z.cell_x_from_1based - 1
  const cx1 = z.cell_x_to_1based - 1
  const cz0 = z.cell_z_from_1based - 1
  const cz1 = z.cell_z_to_1based - 1
  if (
    r0 < 0 ||
    r1 >= geom.rackRows ||
    cx0 < 0 ||
    cx1 >= geom.cellsLength ||
    cz0 < 0 ||
    cz1 >= geom.cellsDepth
  ) {
    return null
  }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let row = r0; row <= r1; row++) {
    for (let ix = cx0; ix <= cx1; ix++) {
      for (let iz = cz0; iz <= cz1; iz++) {
        const [x, , zz] = geom.getCellWorldPosition(row, 0, ix, iz)
        const half = CELL_SIZE / 2 + 0.02
        minX = Math.min(minX, x - half)
        maxX = Math.max(maxX, x + half)
        minZ = Math.min(minZ, zz - half)
        maxZ = Math.max(maxZ, zz + half)
      }
    }
  }
  const l0 = z.level_from_1based - 1
  const l1 = z.level_to_1based - 1
  const levelCount = Math.max(1, l1 - l0 + 1)
  const h = levelCount * LEVEL_HEIGHT
  const y0 = l0 * LEVEL_HEIGHT
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const cy = y0 + h / 2
  return {
    center: [cx, cy, cz],
    size: [maxX - minX, h, maxZ - minZ],
  }
}

function TopologyZonesLayer({
  topology,
  visible,
}: {
  topology: TopologyDocument | null
  visible: boolean
}) {
  const geom = useWarehouseGeometry()
  const boxes = useMemo(() => {
    if (!topology?.zones?.length) return []
    const out: Array<{
      key: string
      center: [number, number, number]
      size: [number, number, number]
      color: string
      name: string
    }> = []
    for (const z of topology.zones) {
      const a = zoneAabb(geom, z)
      if (!a) continue
      out.push({
        key: z.id,
        center: a.center,
        size: a.size,
        color: z.color || "#3b82f6",
        name: z.name,
      })
    }
    return out
  }, [geom, topology])

  if (!visible || boxes.length === 0) return null
  return (
    <group>
      {boxes.map((b) => (
        <group key={b.key} position={b.center}>
          <mesh>
            <boxGeometry args={b.size} />
            <meshStandardMaterial
              color={b.color}
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
          <Text
            position={[0, b.size[1] / 2 + 0.35, 0]}
            fontSize={0.38}
            color={b.color}
            anchorX="center"
            anchorY="bottom"
            maxWidth={6}
          >
            {b.name}
          </Text>
        </group>
      ))}
    </group>
  )
}

function TopologyAislesLayer({
  topology,
  visible,
}: {
  topology: TopologyDocument | null
  visible: boolean
}) {
  const geom = useWarehouseGeometry()
  const polylines = useMemo(() => {
    if (!topology?.aisles?.length) return []
    return topology.aisles
      .filter((a) => a.polyline_norm.length >= 2)
      .map((a) => ({
        id: a.id,
        name: a.name,
        points: a.polyline_norm.map(
          (p) => new Vector3(...normXZToWorldFloor(geom, p.x, p.z, 0.16)),
        ),
        color: a.kind === "main" ? "#0ea5e9" : "#a855f7",
      }))
  }, [geom, topology])

  if (!visible || polylines.length === 0) return null
  return (
    <group>
      {polylines.map((pl) => (
        <group key={pl.id}>
          <Line points={pl.points} color={pl.color} lineWidth={2} />
          <Text
            position={[
              pl.points[0]!.x,
              pl.points[0]!.y + 0.45,
              pl.points[0]!.z,
            ]}
            fontSize={0.28}
            color={pl.color}
            anchorX="left"
            anchorY="bottom"
            maxWidth={4}
          >
            {pl.name}
          </Text>
        </group>
      ))}
    </group>
  )
}

function RouteGraphLayer({
  graph,
  visible,
}: {
  graph: RouteGraphResponse | null
  visible: boolean
}) {
  const geom = useWarehouseGeometry()
  const { nodePositions, edgeSegments } = useMemo(() => {
    if (!graph?.nodes?.length) {
      return {
        nodePositions: [] as Array<[number, number, number]>,
        edgeSegments: [],
      }
    }
    const idToPos = new Map<string, [number, number, number]>()
    for (const n of graph.nodes) {
      const w = routeNodeToWorldFloor(geom, n.position)
      if (w) idToPos.set(n.id, w)
    }
    const segments: Array<
      [[number, number, number], [number, number, number]]
    > = []
    for (const e of graph.edges ?? []) {
      const a = idToPos.get(e.from_node_id)
      const b = idToPos.get(e.to_node_id)
      if (a && b) {
        segments.push([a, b])
      }
    }
    return { nodePositions: [...idToPos.values()], edgeSegments: segments }
  }, [geom, graph])

  if (!visible) return null
  return (
    <group>
      {edgeSegments.map((seg, i) => (
        <Line
          key={i}
          points={[
            new Vector3(seg[0][0], seg[0][1] + 0.02, seg[0][2]),
            new Vector3(seg[1][0], seg[1][1] + 0.02, seg[1][2]),
          ]}
          color="#22c55e"
          lineWidth={1.5}
          opacity={0.85}
          transparent
        />
      ))}
      {nodePositions.map((p, i) => (
        <mesh key={i} position={[p[0], p[1] + 0.06, p[2]]}>
          <cylinderGeometry args={[0.09, 0.09, 0.12, 12]} />
          <meshStandardMaterial
            color="#16a34a"
            emissive="#14532d"
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}
    </group>
  )
}

function hashToUnit(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return (h % 1000) / 1000
}

function poseToWorld(
  geom: WarehouseGeometry,
  pose: LiveEquipmentPose,
): [number, number, number] | null {
  if (pose.xNorm != null && pose.zNorm != null) {
    return normXZToWorldFloor(geom, pose.xNorm, pose.zNorm, pose.y ?? 0.2)
  }
  return routeNodeToWorldFloor(geom, {
    x: pose.x,
    z: pose.z,
    y: pose.y ?? 0.2,
  })
}

function EquipmentMarkersLayer({
  equipment,
  livePositions,
  visible,
}: {
  equipment: TwinEquipmentMarker[]
  livePositions?: Map<string, LiveEquipmentPose> | null
  visible: boolean
}) {
  const geom = useWarehouseGeometry()
  const markers = useMemo(() => {
    const byId = new Map(equipment.map((eq) => [eq.id, eq]))
    const ids = new Set<string>([
      ...equipment.map((eq) => eq.id),
      ...(livePositions ? [...livePositions.keys()] : []),
    ])
    const margin = geom.floorMargin + 0.5
    const fallbackX = -geom.floorWidth / 2 + margin
    const zSpan = geom.floorDepth - 2 * margin
    const out: Array<{
      id: string
      pos: [number, number, number]
      label: string
      status: string
      kind: ReturnType<typeof equipmentTypeToKind>
    }> = []
    let i = 0
    for (const id of ids) {
      const eq = byId.get(id)
      const live = livePositions?.get(id)
      const liveWorld = live ? poseToWorld(geom, live) : null
      const t = hashToUnit(id)
      const fallback: [number, number, number] = [
        fallbackX,
        0.2,
        -zSpan / 2 + t * zSpan + (i % 3) * 0.15,
      ]
      i += 1
      out.push({
        id,
        pos: liveWorld ?? fallback,
        label: eq
          ? eq.name.slice(0, 32)
          : (live?.externalVehicleId ?? id).slice(0, 32),
        status: eq?.current_status ?? "live",
        kind: equipmentTypeToKind(eq?.kind ?? "forklift"),
      })
      if (out.length >= 32) break
    }
    return out
  }, [equipment, geom, livePositions])

  if (!visible || markers.length === 0) return null
  return (
    <group>
      {markers.map((m) => (
        <group key={m.id} position={m.pos}>
          <WarehouseEquipmentMesh kind={m.kind} />
          <Html
            position={[0.6, 1.1, 0]}
            center
            wrapperClass="warehouse-3d-html"
            style={{ pointerEvents: "none" }}
          >
            <div
              style={{
                background: "rgba(15,23,42,0.88)",
                color: "#e2e8f0",
                fontSize: 10,
                padding: "4px 6px",
                borderRadius: 4,
                maxWidth: 140,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {m.label}
              <span style={{ opacity: 0.75, marginLeft: 4 }}>
                ({getEquipmentStatusLabel(m.status)})
              </span>
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}

export type TwinLayersVisibility = {
  zones: boolean
  aisles: boolean
  routeGraph: boolean
  equipment: boolean
}

export function WarehouseTwinLayers({
  topology,
  routeGraph,
  equipment,
  livePositions,
  visibility,
}: {
  topology: TopologyDocument | null
  routeGraph: RouteGraphResponse | null
  equipment: TwinEquipmentMarker[]
  livePositions?: Map<string, LiveEquipmentPose> | null
  visibility: TwinLayersVisibility
}) {
  return (
    <>
      <TopologyZonesLayer topology={topology} visible={visibility.zones} />
      <TopologyAislesLayer topology={topology} visible={visibility.aisles} />
      <RouteGraphLayer graph={routeGraph} visible={visibility.routeGraph} />
      <EquipmentMarkersLayer
        equipment={equipment}
        livePositions={livePositions}
        visible={visibility.equipment}
      />
    </>
  )
}

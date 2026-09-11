/**
 * Маршрут по графу склада (Dijkstra) с фоллбэком на проходы между waypoints.
 */
import { Vector3 } from "three"
import type { RouteGraphResponse } from "@/api/warehouseRouteGraph.ts"
import { routeNodeToWorldFloor } from "@/components/warehouse3d/twin3dCoordinates.ts"
import {
  buildAisleRoutePolyline,
  type WarehouseRouteWaypoint,
} from "@/components/warehouse3d/warehouseAisleRouting.ts"
import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

const EPS = 0.02

type GraphNode = {
  id: string
  x: number
  z: number
  y: number
}

function buildGraphIndex(
  geom: WarehouseGeometry,
  graph: RouteGraphResponse,
): {
  nodes: GraphNode[]
  idToIdx: Map<string, number>
  adj: Array<Array<{ to: number; w: number }>>
} {
  const nodes: GraphNode[] = []
  const idToIdx = new Map<string, number>()
  for (const n of graph.nodes) {
    const w = routeNodeToWorldFloor(geom, n.position)
    if (!w) continue
    const idx = nodes.length
    idToIdx.set(n.id, idx)
    nodes.push({ id: n.id, x: w[0], z: w[2], y: w[1] })
  }
  const adj: Array<Array<{ to: number; w: number }>> = nodes.map(() => [])
  for (const e of graph.edges ?? []) {
    const a = idToIdx.get(e.from_node_id)
    const b = idToIdx.get(e.to_node_id)
    if (a == null || b == null) continue
    const na = nodes[a]!
    const nb = nodes[b]!
    const dist = Math.hypot(na.x - nb.x, na.z - nb.z)
    const w = e.weight != null && e.weight > 0 ? e.weight : dist
    adj[a].push({ to: b, w })
    if (e.bidirectional !== false) {
      adj[b].push({ to: a, w })
    }
  }
  return { nodes, idToIdx, adj }
}

function nearestNodeIndex(
  nodes: GraphNode[],
  x: number,
  z: number,
): number | null {
  if (nodes.length === 0) return null
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    const d = (n.x - x) ** 2 + (n.z - z) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function dijkstra(
  adj: Array<Array<{ to: number; w: number }>>,
  start: number,
  goal: number,
): number[] | null {
  const n = adj.length
  if (start === goal) return [start]
  const dist = new Array<number>(n).fill(Infinity)
  const prev = new Array<number | null>(n).fill(null)
  const seen = new Array<boolean>(n).fill(false)
  dist[start] = 0
  for (let _ = 0; _ < n; _++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!seen[i] && dist[i] < best) {
        best = dist[i]
        u = i
      }
    }
    if (u < 0 || best === Infinity) break
    if (u === goal) break
    seen[u] = true
    for (const { to, w } of adj[u] ?? []) {
      const alt = dist[u]! + w
      if (alt < dist[to]!) {
        dist[to] = alt
        prev[to] = u
      }
    }
  }
  if (!Number.isFinite(dist[goal]!)) return null
  const path: number[] = []
  let cur: number | null = goal
  while (cur != null) {
    path.push(cur)
    cur = prev[cur]!
  }
  path.reverse()
  return path
}

function appendUnique(out: Vector3[], pt: Vector3) {
  const last = out[out.length - 1]
  if (!last || last.distanceTo(pt) > EPS) out.push(pt)
}

/** Полилиния: граф между waypoints + последние метры по проходам до ячеек. */
export function buildRoutePolyline(
  geom: WarehouseGeometry,
  waypoints: WarehouseRouteWaypoint[],
  floorY: number,
  graph: RouteGraphResponse | null | undefined,
  useGraph: boolean,
): Vector3[] {
  if (!useGraph || !graph?.nodes?.length || waypoints.length === 0) {
    return buildAisleRoutePolyline(geom, waypoints, floorY)
  }

  const { nodes, adj } = buildGraphIndex(geom, graph)
  if (nodes.length < 2) {
    return buildAisleRoutePolyline(geom, waypoints, floorY)
  }

  const stagingPts = waypoints.map((w) => {
    const aisle = buildAisleRoutePolyline(geom, [w], floorY)
    return aisle[0] ?? new Vector3(0, floorY, 0)
  })

  const out: Vector3[] = []
  out.push(stagingPts[0]!.clone())

  for (let i = 0; i < waypoints.length - 1; i++) {
    const fromPt = stagingPts[i]!
    const toPt = stagingPts[i + 1]!
    const startIdx = nearestNodeIndex(nodes, fromPt.x, fromPt.z)
    const goalIdx = nearestNodeIndex(nodes, toPt.x, toPt.z)
    if (startIdx == null || goalIdx == null) {
      const fallback = buildAisleRoutePolyline(
        geom,
        [waypoints[i]!, waypoints[i + 1]!],
        floorY,
      )
      for (let k = 1; k < fallback.length; k++) {
        appendUnique(out, fallback[k]!)
      }
      continue
    }
    const idxPath = dijkstra(adj, startIdx, goalIdx)
    if (!idxPath?.length) {
      const fallback = buildAisleRoutePolyline(
        geom,
        [waypoints[i]!, waypoints[i + 1]!],
        floorY,
      )
      for (let k = 1; k < fallback.length; k++) {
        appendUnique(out, fallback[k]!)
      }
      continue
    }
    for (const ni of idxPath) {
      const n = nodes[ni]!
      appendUnique(out, new Vector3(n.x, floorY, n.z))
    }
    appendUnique(out, toPt.clone())
  }

  if (waypoints.length === 1) {
    return stagingPts
  }
  return out
}

/** Список ячеек с изменившейся занятостью между двумя снимками. */
export function diffOccupancyKeys(
  before: import("@/client/index.ts").ItemPublic[],
  after: import("@/client/index.ts").ItemPublic[],
): { gained: Set<string>; lost: Set<string> } {
  const keysOf = (items: import("@/client/index.ts").ItemPublic[]) => {
    const s = new Set<string>()
    for (const item of items) {
      if (item.slot_key) {
        s.add(item.slot_key)
        continue
      }
      const r = item.storage_row
      const l = item.storage_level
      const x = item.storage_cell_x
      const z = item.storage_cell_z
      if (r != null && l != null && x != null && z != null) {
        s.add(`${r - 1}-${l - 1}-${x - 1}-${(z ?? 1) - 1}`)
      }
    }
    return s
  }
  const a = keysOf(before)
  const b = keysOf(after)
  const gained = new Set<string>()
  const lost = new Set<string>()
  for (const k of b) {
    if (!a.has(k)) gained.add(k)
  }
  for (const k of a) {
    if (!b.has(k)) lost.add(k)
  }
  return { gained, lost }
}

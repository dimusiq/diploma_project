import { request } from "@/lib/apiClient.ts"

export type RouteGraphNode = {
  id: string
  warehouse_id: string
  code: string
  node_kind: string
  floor_level: number | null
  position: Record<string, unknown>
  extra?: Record<string, unknown> | null
}

export type RouteGraphEdge = {
  id: string
  warehouse_id: string
  from_node_id: string
  to_node_id: string
  bidirectional: boolean
  weight: number | null
  extra?: Record<string, unknown> | null
}

export type RouteGraphResponse = {
  warehouse_layout_id: string
  nodes: RouteGraphNode[]
  edges: RouteGraphEdge[]
  counts: { nodes: number; edges: number }
}

export function fetchWarehouseRouteGraph(): Promise<RouteGraphResponse> {
  return request<RouteGraphResponse>("/api/v1/warehouse/route-graph")
}

/**
 * Топология склада: GET/PUT /api/v1/warehouse/topology
 */
import { request } from "@/lib/apiClient.ts"

export type StorageZoneType =
  | "storage"
  | "staging"
  | "buffer"
  | "dock_area"
  | "cross_dock"
  | "receiving"
  | "shipping"
  | "other"

export type AisleKind = "main" | "cross" | "feeder"
export type DockType = "inbound" | "outbound" | "cross"

export interface NormPoint {
  x: number
  z: number
}

export interface TopologyStorageZone {
  id: string
  name: string
  zone_type: StorageZoneType
  row_from_1based: number
  row_to_1based: number
  level_from_1based: number
  level_to_1based: number
  cell_x_from_1based: number
  cell_x_to_1based: number
  cell_z_from_1based: number
  cell_z_to_1based: number
  color: string
}

export interface TopologyAisle {
  id: string
  name: string
  kind: AisleKind
  polyline_norm: NormPoint[]
  width_m: number
}

export interface TopologyBufferZone {
  id: string
  name: string
  row_from_1based: number | null
  row_to_1based: number | null
  notes: string
}

export interface TopologyDock {
  id: string
  name: string
  code: string
  dock_type: DockType
  x_norm: number
  z_norm: number
  yaw_deg: number
  bay_count: number
}

export interface TopologyDocument {
  schema_version: 1
  zones: TopologyStorageZone[]
  aisles: TopologyAisle[]
  buffer_zones: TopologyBufferZone[]
  docks: TopologyDock[]
}

export interface RouteGraphSyncResult {
  warehouse_layout_id: string
  nodes_deleted: number
  edges_deleted: number
  nodes_created: number
  edges_created: number
}

export const warehouseTopologyApi = {
  get: () => request<TopologyDocument>("/api/v1/warehouse/topology"),
  put: (body: TopologyDocument) =>
    request<TopologyDocument>("/api/v1/warehouse/topology", {
      method: "PUT",
      body,
    }),
  resetDefaults: () =>
    request<TopologyDocument>("/api/v1/warehouse/topology/reset-defaults", {
      method: "POST",
    }),
  /** Пересборка route_node/route_edge из проходов и доков топологии (активный layout). */
  syncRouteGraph: (warehouse_layout_id?: string | null) =>
    request<RouteGraphSyncResult>(
      "/api/v1/warehouse/topology/sync-route-graph",
      {
        method: "POST",
        body:
          warehouse_layout_id != null && warehouse_layout_id !== ""
            ? { warehouse_layout_id }
            : {},
      },
    ),
}

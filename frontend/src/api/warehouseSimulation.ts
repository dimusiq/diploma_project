import { request } from "@/lib/apiClient.ts"

export interface KpiSnapshot {
  twin_summary: Record<string, unknown>
  occupancy_by_zone: Array<{ zone_name: string; item_count: number }>
  occupancy_by_row: Array<{ storage_row: number; item_count: number }>
  occupancy_by_slot_level: Array<{
    storage_level: number
    slot_kind: string
    item_count: number
  }>
  mean_dwell_days_warehouse: number | null
  near_expiry_items_30d: number
  near_expiry_ratio: number | null
  stock_accuracy_proxy: number | null
  simulation_only_kpis: Record<string, string>
}

export function fetchKpiSnapshot(): Promise<KpiSnapshot> {
  return request<KpiSnapshot>("/api/v1/warehouse/simulation/kpi-snapshot")
}

export type PutawayRule = "nearest" | "round_robin" | "random"

export interface SimulationRunBody {
  duration_hours?: number
  seed?: number
  dock_bays?: number
  num_forklifts?: number
  num_operators?: number
  truck_arrival_rate_per_hour?: number
  mean_dock_service_min?: number
  pick_orders_per_hour?: number
  mean_pick_duration_min?: number
  mean_putaway_duration_min?: number
  replenishment_trips_per_hour?: number
  mean_replenishment_min?: number
  putaway_rule?: PutawayRule
  layout_travel_scale?: number
  sandbox_extra_putaway_min?: number
  /** Стартовые очереди DES из проекций twin (TwinQueueDepthProjection). */
  seed_from_twin?: boolean
  warehouse_id?: string
}

export interface SimulationKpis {
  max_dock_queue: number
  max_putaway_queue: number
  max_pick_queue: number
  mean_dock_turnaround_min: number | null
  mean_inbound_dwell_min: number | null
  mean_pick_wait_min: number | null
  mean_pick_path_proxy_min: number | null
  mean_replenishment_cycle_min: number | null
  forklift_utilization: number
  operator_utilization: number
  dock_utilization: number
  otif_proxy: number
  late_pick_fraction: number
  events_processed: number
}

export interface SimulationRunResult {
  kpis: SimulationKpis
  horizon_minutes: number
  event_trace_tail: Array<Record<string, unknown>>
  twin_initial_state?: Record<string, unknown> | null
}

export function postSimulationRun(
  body: SimulationRunBody,
): Promise<SimulationRunResult> {
  return request<SimulationRunResult>("/api/v1/warehouse/simulation/run", {
    method: "POST",
    body,
  })
}

export interface WarehouseForSimulationSeed {
  id: string
  code: string
  name: string
}

export function fetchWarehousesForSimulationSeed(): Promise<
  WarehouseForSimulationSeed[]
> {
  return request<WarehouseForSimulationSeed[]>(
    "/api/v1/warehouse/simulation/warehouses-for-seed",
  )
}

export interface SimulationScenario {
  id: string
  name: string
  description: string | null
  config: SimulationRunBody
  baseline_kpis: Record<string, unknown> | null
  created_by_user_id: string
  created_at: string
}

export interface SimulationScenarioList {
  data: SimulationScenario[]
  count: number
}

export function fetchSimulationScenarios(): Promise<SimulationScenarioList> {
  return request<SimulationScenarioList>(
    "/api/v1/warehouse/simulations/scenarios",
  )
}

export function postSimulationScenario(body: {
  name: string
  description?: string | null
  config: SimulationRunBody
}): Promise<SimulationScenario> {
  return request<SimulationScenario>(
    "/api/v1/warehouse/simulations/scenarios",
    {
      method: "POST",
      body,
    },
  )
}

export function postSimulationScenarioRun(
  scenarioId: string,
  options?: { seed_from_twin?: boolean; warehouse_id?: string },
): Promise<SimulationRunResult> {
  const params = new URLSearchParams()
  if (options?.seed_from_twin) {
    params.set("seed_from_twin", "true")
  }
  if (options?.warehouse_id) {
    params.set("warehouse_id", options.warehouse_id)
  }
  const q = params.toString()
  const path = `/api/v1/warehouse/simulations/scenarios/${scenarioId}/run${q ? `?${q}` : ""}`
  return request<SimulationRunResult>(path, { method: "POST", body: {} })
}

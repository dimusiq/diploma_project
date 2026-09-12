import { describe, expect, it } from "vitest"
import type { RouteGraphResponse } from "@/api/warehouseRouteGraph.ts"
import {
  buildRoutePolyline,
  diffOccupancyKeys,
} from "@/components/warehouse3d/warehouseRouteGraphPath.ts"
import {
  buildWarehouseGeometry,
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import type { ItemPublic } from "@/client/index.ts"

function item(overrides: Partial<ItemPublic> = {}): ItemPublic {
  return {
    id: "i1",
    title: "Box",
    owner_id: "u1",
    status: "in_stock",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("buildRoutePolyline", () => {
  const geom = buildWarehouseGeometry(DEFAULT_WAREHOUSE_LAYOUT_SPEC)

  it("falls back to aisles when graph is unused", () => {
    const pts = buildRoutePolyline(
      geom,
      [
        { row: 0, level: 0, cellX: 0, cellZ: 0 },
        { row: 0, level: 0, cellX: 5, cellZ: 0 },
      ],
      0.22,
      null,
      true,
    )
    expect(pts.length).toBeGreaterThanOrEqual(2)
  })

  it("routes through graph nodes when they exist", () => {
    const graph: RouteGraphResponse = {
      warehouse_layout_id: "w",
      nodes: [
        {
          id: "a",
          warehouse_id: "w",
          code: "A",
          node_kind: "aisle",
          floor_level: 0,
          position: { x: -4, z: -2, y: 0.14 },
        },
        {
          id: "b",
          warehouse_id: "w",
          code: "B",
          node_kind: "aisle",
          floor_level: 0,
          position: { x: 4, z: -2, y: 0.14 },
        },
      ],
      edges: [
        {
          id: "e",
          warehouse_id: "w",
          from_node_id: "a",
          to_node_id: "b",
          bidirectional: true,
          weight: 8,
        },
      ],
      counts: { nodes: 2, edges: 1 },
    }
    const pts = buildRoutePolyline(
      geom,
      [
        { row: 0, level: 0, cellX: 0, cellZ: 0 },
        { row: 0, level: 0, cellX: 10, cellZ: 0 },
      ],
      0.22,
      graph,
      true,
    )
    expect(pts.length).toBeGreaterThanOrEqual(2)
  })
})

describe("diffOccupancyKeys", () => {
  it("detects gained and lost slots", () => {
    const { gained, lost } = diffOccupancyKeys(
      [item({ id: "a", slot_key: "0-0-0-0" })],
      [item({ id: "b", slot_key: "1-0-0-0" })],
    )
    expect([...gained]).toEqual(["1-0-0-0"])
    expect([...lost]).toEqual(["0-0-0-0"])
  })
})

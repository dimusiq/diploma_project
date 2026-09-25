import { describe, expect, it } from "vitest"
import type { ItemPublic } from "@/client/index.ts"
import {
  cellKeyFromItem1Based,
  congestionByCellKey,
  formatExpiredDaysLabel,
  itemCellKey,
  itemsInCell,
  parseSlotKeyZeroBased,
} from "@/components/warehouse3d/twin3dDerived.ts"
import {
  cellInfoFromHighlightSlot,
  cellInfoToSearch,
  cellMatchesFilter,
  clampSearchToLayout,
  parseCellFilter,
  searchToCellInfo,
  validateWarehouse3dSearch,
  withRecommendedCellHeat,
} from "@/components/warehouse3d/warehouse3dSearch.ts"
import {
  buildWarehouseGeometry,
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
} from "@/components/warehouse3d/warehouseGeometry.tsx"

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

describe("warehouse3dSearch", () => {
  it("does not throw on invalid query and drops NaN coords", () => {
    const s = validateWarehouse3dSearch({
      row: "abc",
      cellZ: 2,
      filter: "nope",
    })
    expect(s.row).toBeUndefined()
    expect(s.cellZ).toBe(2)
    expect(s.filter).toBeUndefined()
  })

  it("clamps coords to layout instead of rejecting", () => {
    const clamped = clampSearchToLayout(
      { row: 99, level: 1, cellX: 50, cellZ: 9 },
      DEFAULT_WAREHOUSE_LAYOUT_SPEC,
    )
    expect(clamped.row).toBe(8)
    expect(clamped.cellX).toBe(12)
    expect(clamped.cellZ).toBe(1)
  })

  it("converts search to 0-based cell", () => {
    const cell = searchToCellInfo({ row: 1, level: 2, cellX: 3, cellZ: 1 })
    expect(cell).toEqual({
      row: 0,
      level: 1,
      cellX: 2,
      cellZ: 0,
      filled: false,
    })
  })

  it("parses cell filter", () => {
    expect(parseCellFilter("expired")).toBe("expired")
    expect(parseCellFilter("x")).toBe("all")
  })

  it("keeps taskId uuid and drops invalid", () => {
    const ok = validateWarehouse3dSearch({
      taskId: "11111111-1111-4111-8111-111111111111",
    })
    expect(ok.taskId).toBe("11111111-1111-4111-8111-111111111111")
    const bad = validateWarehouse3dSearch({ taskId: "not-a-uuid" })
    expect(bad.taskId).toBeUndefined()
  })

  it("serializes cell and taskId into search", () => {
    const s = cellInfoToSearch(
      { row: 0, level: 0, cellX: 1, cellZ: 0, filled: false },
      "expired",
      { taskId: "11111111-1111-4111-8111-111111111111" },
    )
    expect(s).toEqual({
      row: 1,
      level: 1,
      cellX: 2,
      cellZ: 1,
      filter: "expired",
      taskId: "11111111-1111-4111-8111-111111111111",
    })
  })
})

describe("item cell keys", () => {
  it("prefers slot_key and finds items in a cell", () => {
    expect(cellKeyFromItem1Based(1, 1, 1, 1)).toBe("0-0-0-0")
    const a = item({
      id: "a",
      slot_key: "0-0-0-0",
      title: "A",
    })
    const b = item({
      id: "b",
      storage_row: 1,
      storage_level: 1,
      storage_cell_x: 1,
      storage_cell_z: 1,
      title: "B",
    })
    const c = item({
      id: "c",
      storage_row: 2,
      storage_level: 1,
      storage_cell_x: 1,
      storage_cell_z: 1,
      title: "C",
    })
    expect(itemCellKey(a)).toBe("0-0-0-0")
    const found = itemsInCell([a, b, c], {
      row: 0,
      level: 0,
      cellX: 0,
      cellZ: 0,
    })
    expect(found.map((i) => i.id)).toEqual(["a", "b"])
  })

  it("normalizes sim-format slot_key Rxx-yy-zz", () => {
    const simItem = item({ id: "sim", slot_key: "R01-01-1", title: "Sim" })
    expect(itemCellKey(simItem)).toBe("0-0-0-0")
    const found = itemsInCell([simItem], {
      row: 0,
      level: 0,
      cellX: 0,
      cellZ: 0,
    })
    expect(found.map((i) => i.id)).toEqual(["sim"])
  })

  it("counts congestion from slot_key when coordinates are missing", () => {
    const geom = buildWarehouseGeometry(DEFAULT_WAREHOUSE_LAYOUT_SPEC)
    const map = congestionByCellKey(
      [
        item({ id: "a", slot_key: "0-0-0-0" }),
        item({ id: "b", slot_key: "0-1-2-0" }),
      ],
      geom,
    )
    expect(map.get("0-0-0-0")).toBe(1)
    expect(map.get("1-0-0-0")).toBe(0)
  })

  it("parses slot keys", () => {
    expect(parseSlotKeyZeroBased("2-3-4-1")).toEqual([2, 3, 4, 1])
    expect(parseSlotKeyZeroBased("bad")).toBeNull()
  })

  it("formats expired days", () => {
    expect(formatExpiredDaysLabel(21)).toBe("21 день")
  })
})

describe("slotting highlight", () => {
  it("selects and heats the recommended slot without replacing other heat", () => {
    const search = validateWarehouse3dSearch({ highlightSlot: "1-2-3-0" })
    expect(search.highlightSlot).toBe("1-2-3-0")
    expect(cellInfoFromHighlightSlot(search.highlightSlot)).toEqual({
      row: 1,
      level: 2,
      cellX: 3,
      cellZ: 0,
      filled: false,
    })
    const base = new Map<string, number>([["0-0-0-0", 0.4]])
    const heat = withRecommendedCellHeat(base, search.highlightSlot)
    expect(heat.get("0-0-0-0")).toBe(0.4)
    expect(heat.get("1-2-3-0")).toBe(1)
    expect(base.has("1-2-3-0")).toBe(false)
  })
})

describe("cellMatchesFilter", () => {
  it("filters empty occupied expiring expired", () => {
    expect(cellMatchesFilter("empty", false, false, false)).toBe(true)
    expect(cellMatchesFilter("empty", true, false, false)).toBe(false)
    expect(cellMatchesFilter("occupied", true, false, false)).toBe(true)
    expect(cellMatchesFilter("expiring", true, true, false)).toBe(true)
    expect(cellMatchesFilter("expired", true, false, true)).toBe(true)
    expect(cellMatchesFilter("all", false, false, false)).toBe(true)
  })
})

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
  clampSearchToLayout,
  parseCellFilter,
  searchToCellInfo,
  validateWarehouse3dSearch,
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
    expect(clamped.row).toBe(12)
    expect(clamped.cellX).toBe(20)
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

import { describe, expect, it } from "vitest"
import {
  parseWarehouseTaskTarget,
  taskTargetToSearch,
} from "@/lib/warehouseTaskTarget.ts"

describe("parseWarehouseTaskTarget", () => {
  it("reads 1-based storage coords", () => {
    const t = parseWarehouseTaskTarget({
      item_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      storage_row: 2,
      storage_level: 1,
      storage_cell_x: 3,
      storage_cell_z: 1,
    })
    expect(t.itemId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    expect(t.cell).toEqual({
      row: 1,
      level: 0,
      cellX: 2,
      cellZ: 0,
      filled: false,
    })
  })

  it("falls back to slot_key", () => {
    const t = parseWarehouseTaskTarget({ slot_key: "1-2-3-0" })
    expect(t.slotKey).toBe("1-2-3-0")
    expect(t.cell).toEqual({
      row: 1,
      level: 2,
      cellX: 3,
      cellZ: 0,
      filled: false,
    })
  })

  it("returns empty cell for missing payload", () => {
    expect(parseWarehouseTaskTarget(null).cell).toBeNull()
  })
})

describe("taskTargetToSearch", () => {
  it("keeps taskId and 1-based coords", () => {
    const taskId = "11111111-1111-4111-8111-111111111111"
    const s = taskTargetToSearch(taskId, {
      cell: { row: 0, level: 1, cellX: 2, cellZ: 0, filled: false },
    })
    expect(s).toEqual({
      taskId,
      row: 1,
      level: 2,
      cellX: 3,
      cellZ: 1,
    })
  })
})

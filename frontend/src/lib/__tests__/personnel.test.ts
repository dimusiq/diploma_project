import { describe, expect, it } from "vitest"
import { describeDetection, filterPersonnel, fullName, shortPersonName, type PersonnelRecord } from "@/lib/personnel.ts"

const ivanov: PersonnelRecord = {
  id: "1",
  employee_code: "EMP-001",
  first_name: "Иван",
  last_name: "Иванов",
  middle_name: "Иванович",
  position: "Кладовщик",
  department: "Склад №1",
  status: "active",
  shift: "day",
  current_zone: "aisle-2",
  motion_status: "walking",
}

const petrov: PersonnelRecord = {
  ...ivanov,
  id: "2",
  employee_code: "EMP-002",
  first_name: "Алексей",
  last_name: "Петров",
  middle_name: "Сергеевич",
  position: "Комплектовщик",
  shift: "night",
  status: "inactive",
}

describe("personnel directory", () => {
  it("formats the employee name", () => {
    expect(fullName(ivanov)).toBe("Иванов Иван Иванович")
    expect(shortPersonName(fullName(ivanov))).toBe("Иванов И.И.")
  })

  it("filters by search, position, shift and status", () => {
    const rows = [ivanov, petrov]
    expect(filterPersonnel(rows, { q: "петров", position: "", shift: "", status: "" })).toEqual([petrov])
    expect(filterPersonnel(rows, { q: "", position: "Кладовщик", shift: "day", status: "active" })).toEqual([ivanov])
    expect(filterPersonnel(rows, { q: "", position: "", shift: "night", status: "" })).toEqual([petrov])
  })

  it("names a camera person from the runtime track and leaves strangers unknown", () => {
    const matched = describeDetection(
      { class_name: "person", track_id: "wrk-1", confidence: 0.92 },
      [{ id: "wrk-1", code: "PERSON-001", displayName: "Иванов Иван Иванович" }],
    )
    expect(matched.primary).toBe("Иванов И.И.")
    expect(matched.detail).toBe("0.92")
    const unknown = describeDetection(
      { class_name: "person", track_id: "stranger", confidence: 0.4 },
      [],
    )
    expect(unknown.primary).toBe("Неизвестный человек")
    expect(unknown.detail).toBe("0.40")
  })
})

import { describe, expect, it } from "vitest"
import { canAccessWarehouseSim } from "@/lib/warehouseSimAccess.ts"

describe("canAccessWarehouseSim", () => {
  it("allows superuser and admin role", () => {
    expect(canAccessWarehouseSim({ is_superuser: true, role_name: "user" })).toBe(
      true,
    )
    expect(
      canAccessWarehouseSim({ is_superuser: false, role_name: "admin" }),
    ).toBe(true)
  })

  it("denies ordinary users and missing session", () => {
    expect(
      canAccessWarehouseSim({ is_superuser: false, role_name: "operator" }),
    ).toBe(false)
    expect(canAccessWarehouseSim(null)).toBe(false)
  })
})

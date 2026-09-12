import { describe, expect, it } from "vitest"
import { boolQuerySearch, pageNumberSearch } from "@/lib/routeSearch.ts"

describe("routeSearch", () => {
  it("coerces page from query string", () => {
    expect(pageNumberSearch.parse("2")).toBe(2)
    expect(pageNumberSearch.parse(3)).toBe(3)
    expect(pageNumberSearch.parse("nope")).toBe(1)
  })

  it("parses boolean query flags", () => {
    expect(boolQuerySearch.parse("true")).toBe(true)
    expect(boolQuerySearch.parse("false")).toBe(false)
    expect(boolQuerySearch.parse(undefined)).toBe(false)
  })
})

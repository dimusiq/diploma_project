import { describe, expect, it } from "vitest"
import { ruPlural } from "@/lib/ruPlural.ts"

describe("ruPlural", () => {
  it("declines days", () => {
    expect(ruPlural(1, "день", "дня", "дней")).toBe("день")
    expect(ruPlural(2, "день", "дня", "дней")).toBe("дня")
    expect(ruPlural(5, "день", "дня", "дней")).toBe("дней")
    expect(ruPlural(11, "день", "дня", "дней")).toBe("дней")
    expect(ruPlural(21, "день", "дня", "дней")).toBe("день")
    expect(ruPlural(22, "день", "дня", "дней")).toBe("дня")
    expect(ruPlural(25, "день", "дня", "дней")).toBe("дней")
  })
})

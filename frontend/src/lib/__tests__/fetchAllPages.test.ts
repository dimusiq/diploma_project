import { describe, expect, it, vi } from "vitest"

import { fetchAllPages } from "@/lib/fetchAllPages.ts"

describe("fetchAllPages", () => {
  it("догружает страницы до короткого батча", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 200 }, (_, i) => ({ id: `a${i}` })),
        count: 201,
      })
      .mockResolvedValueOnce({
        data: [{ id: "last" }],
        count: 201,
      })

    const all = await fetchAllPages({ pageSize: 200, fetchPage })
    expect(all).toHaveLength(201)
    expect(all[all.length - 1]?.id).toBe("last")
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 200)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 200, 200)
  })

  it("останавливается, когда count достигнут на полной странице", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      data: Array.from({ length: 200 }, (_, i) => ({ id: `a${i}` })),
      count: 200,
    })
    const all = await fetchAllPages({ pageSize: 200, fetchPage })
    expect(all).toHaveLength(200)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})

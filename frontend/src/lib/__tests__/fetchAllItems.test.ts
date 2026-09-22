import { afterEach, describe, expect, it, vi } from "vitest"
import { ItemsService } from "@/client/index.ts"
import { fetchAllItems, itemsFingerprint } from "@/lib/fetchAllItems.ts"

describe("fetchAllItems", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("pages until a short batch", async () => {
    const spy = vi
      .spyOn(ItemsService, "readItems")
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, i) => ({
          id: `a${i}`,
          title: "t",
          owner_id: "u",
          status: "in_stock",
          created_at: "2025-01-01T00:00:00Z",
        })),
        count: 501,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "last",
            title: "t",
            owner_id: "u",
            status: "in_stock",
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
        count: 501,
      })

    const all = await fetchAllItems()
    expect(all).toHaveLength(501)
    expect(all[all.length - 1]?.id).toBe("last")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("stops when count is reached on a full page", async () => {
    const spy = vi.spyOn(ItemsService, "readItems").mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: `a${i}`,
        title: "t",
        owner_id: "u",
        status: "in_stock",
        created_at: "2025-01-01T00:00:00Z",
      })),
      count: 500,
    })
    const all = await fetchAllItems()
    expect(all).toHaveLength(500)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("fingerprints occupancy-relevant fields", () => {
    expect(
      itemsFingerprint([
        {
          id: "1",
          title: "a",
          owner_id: "u",
          status: "in_stock",
          created_at: "2025-01-01T00:00:00Z",
          quantity: 2,
          slot_key: "0-0-0-0",
        },
      ]),
    ).toContain("0-0-0-0")
  })
})

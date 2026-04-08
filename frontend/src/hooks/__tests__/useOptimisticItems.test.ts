import { renderHook } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import type { ItemPublic } from "@/client/index.ts"
import { useOptimisticItems } from "../useOptimisticItems"

function makeItem(overrides: Partial<ItemPublic> = {}): ItemPublic {
  return {
    id: "item-1",
    title: "Test Item",
    owner_id: "user-1",
    status: "in_stock",
    created_at: "2025-01-01T00:00:00Z",
    quantity: 5,
    sku: "SKU-001",
    ...overrides,
  }
}

describe("useOptimisticItems", () => {
  it("returns the same items when no optimistic update is applied", () => {
    const items = [makeItem({ id: "1" }), makeItem({ id: "2" })]
    const { result } = renderHook(() => useOptimisticItems(items))

    const [optimistic, addOptimisticRemove] = result.current
    expect(optimistic).toEqual(items)
    expect(typeof addOptimisticRemove).toBe("function")
  })

  it("returns correct tuple shape", () => {
    const { result } = renderHook(() => useOptimisticItems([]))
    expect(Array.isArray(result.current)).toBe(true)
    expect(result.current).toHaveLength(2)
    expect(Array.isArray(result.current[0])).toBe(true)
    expect(typeof result.current[1]).toBe("function")
  })

  it("returns empty array when given empty items", () => {
    const { result } = renderHook(() => useOptimisticItems([]))
    expect(result.current[0]).toEqual([])
  })

  it("reflects updated items on re-render", () => {
    const initial = [makeItem({ id: "1" })]
    const { result, rerender } = renderHook(
      ({ items }) => useOptimisticItems(items),
      { initialProps: { items: initial } },
    )

    expect(result.current[0]).toHaveLength(1)

    const updated = [makeItem({ id: "1" }), makeItem({ id: "2" })]
    rerender({ items: updated })
    expect(result.current[0]).toHaveLength(2)
    expect(result.current[0][1].id).toBe("2")
  })

  it("reflects removed items when upstream data changes", () => {
    const initial = [makeItem({ id: "1" }), makeItem({ id: "2" })]
    const { result, rerender } = renderHook(
      ({ items }) => useOptimisticItems(items),
      { initialProps: { items: initial } },
    )

    expect(result.current[0]).toHaveLength(2)

    rerender({ items: [makeItem({ id: "1" })] })
    expect(result.current[0]).toHaveLength(1)
    expect(result.current[0][0].id).toBe("1")
  })
})

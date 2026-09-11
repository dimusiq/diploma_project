import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CategoriesService, ItemsService } from "@/client/index.ts"
import type { ItemPublic, ItemsPublic } from "@/client/types.gen.ts"

import { ItemDataTable, type ItemDataTableProps } from "../ItemDataTable"

function makeItem(overrides: Partial<ItemPublic> = {}): ItemPublic {
  return {
    id: "item-1",
    title: "Test Item",
    description: "A test item",
    owner_id: "user-1",
    status: "in_stock",
    created_at: "2025-01-15T10:00:00Z",
    quantity: 5,
    sku: "SKU-001",
    unit: "шт",
    ...overrides,
  }
}

let queryClient: QueryClient

async function renderTable(props: ItemDataTableProps = {}) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ItemDataTable {...props} />,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  })
}

describe("ItemDataTable", () => {
  beforeEach(() => {
    vi.spyOn(CategoriesService, "readCategories").mockResolvedValue([] as any)
  })

  afterEach(() => {
    queryClient?.clear()
    vi.restoreAllMocks()
  })

  it("renders empty state when no items exist", async () => {
    vi.spyOn(ItemsService, "readItems").mockResolvedValue({
      data: [],
      count: 0,
    } as ItemsPublic)

    await renderTable({ emptyTitle: "Нет данных" })

    expect(await screen.findByText("Нет данных")).toBeInTheDocument()
  })

  it("renders items in table rows", async () => {
    const mockItems = [
      makeItem({ id: "1", title: "Widget A", sku: "W-001", quantity: 10 }),
      makeItem({ id: "2", title: "Widget B", sku: "W-002", quantity: 3 }),
    ]

    vi.spyOn(ItemsService, "readItems").mockResolvedValue({
      data: mockItems,
      count: 2,
    } as ItemsPublic)

    await renderTable()

    expect(await screen.findByText("Widget A")).toBeInTheDocument()
    expect(screen.getByText("Widget B")).toBeInTheDocument()
    expect(screen.getByText("W-001")).toBeInTheDocument()
    expect(screen.getByText("W-002")).toBeInTheDocument()
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("shows expected column headers", async () => {
    vi.spyOn(ItemsService, "readItems").mockResolvedValue({
      data: [makeItem()],
      count: 1,
    } as ItemsPublic)

    await renderTable()

    await screen.findByText("Test Item")

    expect(screen.getByText("Название")).toBeInTheDocument()
    expect(screen.getByText("Описание")).toBeInTheDocument()
    expect(screen.getByText("Кол-во")).toBeInTheDocument()
    expect(screen.getByText("Артикул")).toBeInTheDocument()
    expect(screen.getByText("Категория")).toBeInTheDocument()
    expect(screen.getByText("Дата")).toBeInTheDocument()
    expect(screen.getByText("Действия")).toBeInTheDocument()
  })

  it("renders search input", async () => {
    vi.spyOn(ItemsService, "readItems").mockResolvedValue({
      data: [makeItem()],
      count: 1,
    } as ItemsPublic)

    await renderTable()

    await screen.findByText("Test Item")

    expect(
      screen.getByPlaceholderText(
        "Поиск по названию, описанию, артикулу, штрихкоду...",
      ),
    ).toBeInTheDocument()
  })

  it("shows N/A for missing description", async () => {
    vi.spyOn(ItemsService, "readItems").mockResolvedValue({
      data: [makeItem({ description: "" })],
      count: 1,
    } as ItemsPublic)

    await renderTable()

    expect(await screen.findByText("N/A")).toBeInTheDocument()
  })

  it("shows dash for missing sku", async () => {
    vi.spyOn(ItemsService, "readItems").mockResolvedValue({
      data: [makeItem({ sku: "" })],
      count: 1,
    } as ItemsPublic)

    await renderTable()

    await screen.findByText("Test Item")
    const dashes = screen.getAllByText("—")
    expect(dashes.length).toBeGreaterThan(0)
  })

  it("renders error state and retry button", async () => {
    vi.spyOn(ItemsService, "readItems").mockRejectedValue(
      new Error("Network error"),
    )

    await renderTable()

    expect(
      await screen.findByText("Не удалось загрузить список"),
    ).toBeInTheDocument()
    expect(screen.getByText("Повторить")).toBeInTheDocument()
  })
})

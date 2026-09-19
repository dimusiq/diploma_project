import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as warehouseTasksApi from "@/api/warehouseTasks.ts"
import { WarehouseTasksView } from "../WarehouseTasksView"

vi.mock("@/hooks/useCustomToast.ts", () => ({
  default: () => ({
    showErrorToast: vi.fn(),
    showSuccessToast: vi.fn(),
  }),
}))

async function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <WarehouseTasksView showChrome={false} />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe("WarehouseTasksView labels", () => {
  beforeEach(() => {
    vi.spyOn(warehouseTasksApi, "fetchWarehouseTasks").mockResolvedValue({
      data: [
        {
          id: "task-1",
          warehouse_id: "wh-1",
          task_type: "pick",
          status: "pending",
          priority: 5,
          assigned_user_id: null,
          handling_unit_id: null,
          storage_bin_id: null,
          payload: null,
          created_at: "2026-01-01T10:00:00Z",
          updated_at: "2026-01-01T10:00:00Z",
        },
        {
          id: "task-2",
          warehouse_id: "wh-1",
          task_type: "putaway",
          status: "blocked",
          priority: 2,
          assigned_user_id: null,
          handling_unit_id: null,
          storage_bin_id: null,
          payload: null,
          created_at: "2026-01-01T10:00:00Z",
          updated_at: "2026-01-01T10:00:00Z",
        },
      ],
      count: 2,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows Russian labels and keeps API enum values for filtering", async () => {
    await renderView()
    await waitFor(() => {
      expect(screen.getByText("Ожидает")).toBeTruthy()
    })
    expect(screen.getByText("Заблокировано")).toBeTruthy()
    expect(screen.getByText("Отбор")).toBeTruthy()
    expect(screen.getByText("Размещение")).toBeTruthy()
    expect(screen.queryByText("pending")).toBeNull()
    expect(screen.queryByText("blocked")).toBeNull()
    expect(warehouseTasksApi.fetchWarehouseTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        status: undefined,
        limit: 100,
      }),
    )
  })
})

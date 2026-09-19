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
import { outboundOrdersApi } from "@/api/outboundOrders.ts"
import { OutboundShipmentBoard } from "../OutboundShipmentBoard"

vi.mock("@/hooks/useCustomToast.ts", () => ({
  default: () => ({
    showErrorToast: vi.fn(),
    showSuccessToast: vi.fn(),
  }),
}))

const emptyBoard = {
  data: [],
  count: 0,
  ready_count: 0,
  items_count: 0,
  pallets_count: 0,
  awaiting_transport: 0,
}

async function renderBoard(stage: "ready" | "shipped") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <OutboundShipmentBoard stage={stage} />,
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

describe("OutboundShipmentBoard", () => {
  beforeEach(() => {
    vi.spyOn(outboundOrdersApi, "listReady").mockResolvedValue(emptyBoard)
    vi.spyOn(outboundOrdersApi, "listShippedBoard").mockResolvedValue(emptyBoard)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows empty state for ready board", async () => {
    await renderBoard("ready")
    await waitFor(() => {
      expect(screen.getByText("Нет заказов, готовых к отгрузке")).toBeTruthy()
    })
    const cta = screen.getByRole("link", { name: "Перейти к исходящим заказам" })
    expect(cta.getAttribute("href")).toBe("/outbound-orders")
  })

  it("renders a packed order card without using item.status", async () => {
    vi.spyOn(outboundOrdersApi, "listReady").mockResolvedValue({
      data: [
        {
          id: "ord-1",
          warehouse_id: "wh-1",
          code: "OUT-1024",
          shipment_id: null,
          status: "packed",
          ship_by_at: null,
          lines: { items: [{ skuId: "SKU-1", pallets: 3 }] },
          extra: { customer: "ООО Ромашка" },
          created_at: "2026-01-01T10:00:00Z",
          updated_at: "2026-01-01T14:32:00Z",
          customer: "ООО Ромашка",
          items_count: 1,
          total_quantity: 3,
          pallets_count: 3,
          picking_status: "complete",
          packing_status: "complete",
          ready_at: "2026-01-01T14:32:00Z",
          transport_id: null,
          transport_label: null,
          transport_status: null,
          transport_assigned: false,
        },
      ],
      count: 1,
      ready_count: 1,
      items_count: 1,
      pallets_count: 3,
      awaiting_transport: 1,
    })
    await renderBoard("ready")
    await waitFor(() => {
      expect(screen.getByText("Заказ #OUT-1024")).toBeTruthy()
    })
    expect(screen.getByText("ООО Ромашка")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Отгрузить" })).toBeTruthy()
    expect(screen.getByText(/Не назначен/)).toBeTruthy()
    expect(outboundOrdersApi.listReady).toHaveBeenCalled()
    expect(outboundOrdersApi.listShippedBoard).not.toHaveBeenCalled()
  })
})

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { outboundOrdersApi } from "@/api/outboundOrders.ts"
import { OutboundOrderDetailDialog } from "../OutboundOrderCard"

vi.mock("@/hooks/useCustomToast.ts", () => ({
  default: () => ({
    showErrorToast: vi.fn(),
    showSuccessToast: vi.fn(),
  }),
}))

const detail = {
  id: "11111111-1111-1111-1111-111111111111",
  warehouse_id: "22222222-2222-2222-2222-222222222222",
  code: "OUT-360",
  status: "packed",
  shipment_id: null,
  ship_by_at: null,
  lines: null,
  extra: null,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T12:00:00Z",
  customer: "ООО Ромашка",
  items_count: 1,
  total_quantity: 4,
  pallets_count: 1,
  picking_status: "complete",
  packing_status: "pending",
  ready_at: null,
  transport_id: null,
  transport_label: null,
  transport_status: null,
  transport_assigned: false,
  line_items: [{ sku_id: "SKU-1", pallets: 1, quantity: 4, picked: 4 }],
  tasks: [
    {
      id: "33333333-3333-3333-3333-333333333333",
      task_type: "pick",
      status: "completed",
      updated_at: "2026-01-01T11:00:00Z",
      source: "STOR",
      destination: "PACK",
    },
  ],
  items: [],
  timeline: [{ kind: "created", label: "Заказ создан", at: "2026-01-01T10:00:00Z" }],
  equipment: [
    {
      id: "44444444-4444-4444-4444-444444444444",
      name: "AGV-01",
      code: "agv-1",
    },
  ],
  events: [
    {
      id: "55555555-5555-5555-5555-555555555555",
      at: "2026-01-01T11:30:00Z",
      event_type: "ORDER_PICKED",
      message: "Отбор завершён",
    },
  ],
}

async function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <OutboundOrderDetailDialog orderId={detail.id} onClose={() => undefined} />
    ),
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

describe("OutboundOrderDetailDialog", () => {
  it("shows order sections from the fulfillment payload", async () => {
    vi.spyOn(outboundOrdersApi, "getFulfillment").mockResolvedValue(detail as never)
    const user = userEvent.setup()
    await renderDialog()
    await waitFor(() => {
      expect(screen.getByText("Заказ #OUT-360")).toBeTruthy()
    })
    expect(screen.getByText(/ООО Ромашка/)).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Позиции" }))
    expect(screen.getByText(/SKU SKU-1/)).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Хронология" }))
    expect(screen.getByText("Заказ создан")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Задания" }))
    expect(screen.getByText(/STOR/)).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Техника" }))
    expect(screen.getByRole("link", { name: /AGV-01/ })).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Отгрузка" }))
    expect(screen.getByText(/Отобрано/)).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "События" }))
    expect(screen.getByText("Отбор завершён")).toBeTruthy()
  })
})

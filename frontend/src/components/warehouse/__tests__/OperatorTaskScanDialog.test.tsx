import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as scanApiMod from "@/api/scan.ts"
import type { WarehouseTask } from "@/api/warehouseTasks.ts"
import { OperatorTaskScanDialog } from "@/components/warehouse/OperatorTaskScanDialog.tsx"
import { OPERATOR_PICK_QUEUE_KEY } from "@/lib/operatorPickQueue.ts"

const task: WarehouseTask = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  warehouse_id: "wh-1",
  task_type: "pick",
  status: "in_progress",
  priority: 10,
  assigned_user_id: "user-1",
  handling_unit_id: null,
  storage_bin_id: null,
  payload: {
    order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sku: "SKU-100",
    quantity: 5,
    slot_key: "0-0-0-0",
    storage_row: 1,
    storage_level: 1,
    storage_cell_x: 1,
    storage_cell_z: 1,
  },
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
}

describe("OperatorTaskScanDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    })
  })

  it("walks slot → item → qty → confirm and calls confirmPick", async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const confirmPick = vi
      .spyOn(scanApiMod.scanApi, "confirmPick")
      .mockResolvedValue({
        order_id: String(task.payload?.order_id),
        order_status: "picking",
        task_id: task.id,
        status: "completed",
        confirmed_quantity: 3,
      })

    render(
      <OperatorTaskScanDialog
        open
        onOpenChange={() => {}}
        task={task}
        onDone={onDone}
      />,
    )

    await user.type(screen.getByLabelText(/код ячейки/i), "0-0-0-0")
    await user.click(screen.getByRole("button", { name: /далее: товар/i }))
    await user.type(screen.getByLabelText(/штрихкод/i), "SKU-100")
    await user.click(screen.getByRole("button", { name: /далее: количество/i }))
    const qty = screen.getByLabelText(/фактическое количество/i)
    await user.clear(qty)
    await user.type(qty, "3")
    expect(screen.getByText(/недобор/i)).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: /далее: подтверждение/i }),
    )
    expect(screen.getByText(/план 5/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /подтвердить отбор/i }))

    await waitFor(() => expect(confirmPick).toHaveBeenCalledTimes(1))
    expect(confirmPick.mock.calls[0]?.[0]).toMatchObject({
      code: "SKU-100",
      quantity: 3,
      outcome: "ok",
      scanned_slot_key: "0-0-0-0",
    })
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "ok",
        queued: false,
        shortfall: true,
      }),
    )
  })

  it("shows mismatch when cell scan differs", async () => {
    const user = userEvent.setup()
    render(
      <OperatorTaskScanDialog
        open
        onOpenChange={() => {}}
        task={task}
        onDone={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/код ячейки/i), "9-9-9-9")
    await user.click(screen.getByRole("button", { name: /далее: товар/i }))
    expect(screen.getByRole("alert")).toHaveTextContent(/не совпала ячейка/i)
  })

  it("buffers confirmation when browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    })
    const user = userEvent.setup()
    const onDone = vi.fn()
    const confirmPick = vi.spyOn(scanApiMod.scanApi, "confirmPick")

    render(
      <OperatorTaskScanDialog
        open
        onOpenChange={() => {}}
        task={task}
        onDone={onDone}
      />,
    )
    await user.type(screen.getByLabelText(/код ячейки/i), "0-0-0-0")
    await user.click(screen.getByRole("button", { name: /далее: товар/i }))
    await user.type(screen.getByLabelText(/штрихкод/i), "SKU-100")
    await user.click(screen.getByRole("button", { name: /далее: количество/i }))
    await user.click(
      screen.getByRole("button", { name: /далее: подтверждение/i }),
    )
    await user.click(screen.getByRole("button", { name: /подтвердить отбор/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(confirmPick).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ queued: true, outcome: "ok" }),
    )
    expect(window.localStorage.getItem(OPERATOR_PICK_QUEUE_KEY)).toBeTruthy()
  })
})

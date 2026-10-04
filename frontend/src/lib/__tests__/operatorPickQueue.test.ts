import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ScanConfirmPickBody, ScanConfirmPickResult } from "@/api/scan.ts"
import {
  OPERATOR_PICK_QUEUE_KEY,
  enqueueOperatorPick,
  flushOperatorPickQueue,
  pendingOperatorPickCount,
  readOperatorPickQueue,
  writeOperatorPickQueue,
} from "@/lib/operatorPickQueue.ts"

const sampleBody = (n: number): ScanConfirmPickBody => ({
  order_id: `00000000-0000-4000-8000-00000000000${n}`,
  task_id: `11111111-1111-4111-8111-11111111111${n}`,
  code: `SKU-${n}`,
  outcome: "ok",
  quantity: 1,
})

describe("operatorPickQueue", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it("enqueues confirmations and reports pending count", () => {
    enqueueOperatorPick(sampleBody(1))
    enqueueOperatorPick(sampleBody(2))
    expect(pendingOperatorPickCount()).toBe(2)
    const q = readOperatorPickQueue()
    expect(q).toHaveLength(2)
    expect(q[0]?.body.code).toBe("SKU-1")
    expect(window.localStorage.getItem(OPERATOR_PICK_QUEUE_KEY)).toBeTruthy()
  })

  it("flushes queue in order and clears on success", async () => {
    enqueueOperatorPick(sampleBody(1))
    enqueueOperatorPick(sampleBody(2))
    const calls: ScanConfirmPickBody[] = []
    const confirm = vi.fn(async (body: ScanConfirmPickBody) => {
      calls.push(body)
      return {
        order_id: body.order_id,
        order_status: "picking",
        task_id: body.task_id,
        status: "completed",
      } satisfies ScanConfirmPickResult
    })
    const result = await flushOperatorPickQueue(confirm)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.remaining).toBe(0)
    expect(calls.map((c) => c.code)).toEqual(["SKU-1", "SKU-2"])
    expect(pendingOperatorPickCount()).toBe(0)
  })

  it("stops on first failure and keeps remaining items", async () => {
    enqueueOperatorPick(sampleBody(1))
    enqueueOperatorPick(sampleBody(2))
    enqueueOperatorPick(sampleBody(3))
    let n = 0
    const confirm = vi.fn(async (body: ScanConfirmPickBody) => {
      n += 1
      if (n === 2) throw new Error("сеть недоступна")
      return {
        order_id: body.order_id,
        order_status: "picking",
        task_id: body.task_id,
        status: "completed",
      } satisfies ScanConfirmPickResult
    })
    const result = await flushOperatorPickQueue(confirm)
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.remaining).toBe(2)
    const left = readOperatorPickQueue()
    expect(left.map((x) => x.body.code)).toEqual(["SKU-2", "SKU-3"])
    expect(left[0]?.attempts).toBe(1)
    expect(left[0]?.lastError).toContain("сеть")
  })

  it("write/read round-trip tolerates corrupt storage", () => {
    writeOperatorPickQueue([
      {
        id: "a",
        enqueuedAt: "2026-01-01T00:00:00Z",
        body: sampleBody(9),
        attempts: 0,
      },
    ])
    window.localStorage.setItem(OPERATOR_PICK_QUEUE_KEY, "{not-json")
    expect(readOperatorPickQueue()).toEqual([])
  })
})

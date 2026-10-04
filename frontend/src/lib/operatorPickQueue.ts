/**
 * Офлайн-буфер подтверждений отбора: localStorage + flush при online.
 */
import type { ScanConfirmPickBody, ScanConfirmPickResult } from "@/api/scan.ts"
import { scanApi } from "@/api/scan.ts"

export const OPERATOR_PICK_QUEUE_KEY = "nebardak.operatorPickQueue.v1"

export type OperatorPickQueueItem = {
  id: string
  enqueuedAt: string
  body: ScanConfirmPickBody
  attempts: number
  lastError?: string
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function readOperatorPickQueue(): OperatorPickQueueItem[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(OPERATOR_PICK_QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is OperatorPickQueueItem =>
        typeof row === "object" &&
        row != null &&
        typeof (row as OperatorPickQueueItem).id === "string" &&
        typeof (row as OperatorPickQueueItem).body === "object",
    )
  } catch {
    return []
  }
}

export function writeOperatorPickQueue(items: OperatorPickQueueItem[]): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(OPERATOR_PICK_QUEUE_KEY, JSON.stringify(items))
}

export function enqueueOperatorPick(
  body: ScanConfirmPickBody,
): OperatorPickQueueItem {
  const item: OperatorPickQueueItem = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enqueuedAt: new Date().toISOString(),
    body,
    attempts: 0,
  }
  const next = [...readOperatorPickQueue(), item]
  writeOperatorPickQueue(next)
  return item
}

export function pendingOperatorPickCount(): number {
  return readOperatorPickQueue().length
}

export type FlushOperatorPickResult = {
  sent: number
  failed: number
  remaining: number
  results: ScanConfirmPickResult[]
}

/** Отправляет очередь по порядку; при ошибке останавливается (сохраняет порядок). */
export async function flushOperatorPickQueue(
  confirm: typeof scanApi.confirmPick = scanApi.confirmPick,
): Promise<FlushOperatorPickResult> {
  const queue = readOperatorPickQueue()
  if (queue.length === 0) {
    return { sent: 0, failed: 0, remaining: 0, results: [] }
  }
  const remaining: OperatorPickQueueItem[] = []
  const results: ScanConfirmPickResult[] = []
  let sent = 0
  let failed = 0
  let stop = false
  for (const item of queue) {
    if (stop) {
      remaining.push(item)
      continue
    }
    try {
      const res = await confirm(item.body)
      results.push(res)
      sent += 1
    } catch (err: unknown) {
      failed += 1
      stop = true
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : "Ошибка синхронизации",
      })
    }
  }
  writeOperatorPickQueue(remaining)
  return { sent, failed, remaining: remaining.length, results }
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

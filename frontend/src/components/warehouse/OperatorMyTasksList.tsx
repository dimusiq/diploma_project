/**
 * Мобильный список «Мои задания»: полный цикл скана, авто-переход, офлайн-очередь.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { FiCamera, FiCloudOff, FiRefreshCw } from "react-icons/fi"
import type { WarehouseTask } from "@/api/warehouseTasks.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  OperatorTaskScanDialog,
  type OperatorScanDoneResult,
} from "@/components/warehouse/OperatorTaskScanDialog.tsx"
import { useOperatorPickQueue } from "@/hooks/useOperatorPickQueue.ts"
import {
  getPriorityLabel,
  getTaskStatusLabel,
  getTaskStatusMeta,
  getTaskTypeLabel,
  STATUS_TONE_CLASS,
} from "@/lib/statusLabels.ts"
import { parseWarehouseTaskTarget } from "@/lib/warehouseTaskTarget.ts"
import { cn } from "@/lib/utils.ts"

function orderIdOf(task: WarehouseTask): string | null {
  const raw = task.payload?.order_id ?? task.payload?.orderId
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null
}

function isOpenTask(task: WarehouseTask): boolean {
  return !["completed", "cancelled", "canceled"].includes(task.status)
}

export function OperatorMyTasksList({
  tasks,
  highlightTaskId,
  currentUserId,
  onClaim,
  onRefresh,
  claiming,
  openScanTaskId = null,
  onOpenScanConsumed,
}: {
  tasks: WarehouseTask[]
  highlightTaskId?: string | null
  currentUserId: string
  onClaim: (taskId: string) => void
  onRefresh: (info?: {
    queued?: boolean
    shortfall?: boolean
    outcome?: "ok" | "no_stock"
  }) => void
  claiming?: boolean
  openScanTaskId?: string | null
  onOpenScanConsumed?: () => void
}) {
  const [scanTask, setScanTask] = useState<WarehouseTask | null>(null)
  const [liveMsg, setLiveMsg] = useState("")

  const onFlushed = useCallback(
    (r: { sent: number; remaining: number }) => {
      if (r.sent > 0) {
        setLiveMsg(
          r.remaining > 0
            ? `Синхронизировано ${r.sent}, осталось ${r.remaining}`
            : `Синхронизировано подтверждений: ${r.sent}`,
        )
        onRefresh({ queued: false })
      }
    },
    [onRefresh],
  )

  const { pending, online, syncing, flush, refresh } =
    useOperatorPickQueue(onFlushed)

  const sorted = useMemo(() => {
    const open = tasks.filter(isOpenTask)
    open.sort((a, b) => {
      const aMine = a.assigned_user_id === currentUserId ? 0 : 1
      const bMine = b.assigned_user_id === currentUserId ? 0 : 1
      if (aMine !== bMine) return aMine - bMine
      const aSeq =
        typeof a.payload?.wave_seq === "number" ? a.payload.wave_seq : 1e9
      const bSeq =
        typeof b.payload?.wave_seq === "number" ? b.payload.wave_seq : 1e9
      if (aSeq !== bSeq) return aSeq - bSeq
      return b.priority - a.priority
    })
    return open
  }, [tasks, currentUserId])

  const nextScannable = useCallback(
    (afterId: string | null): WarehouseTask | null => {
      const mine = sorted.filter(
        (t) =>
          t.assigned_user_id === currentUserId &&
          t.task_type === "pick" &&
          Boolean(orderIdOf(t)) &&
          t.id !== afterId,
      )
      return mine[0] ?? null
    },
    [sorted, currentUserId],
  )

  useEffect(() => {
    if (!openScanTaskId) return
    const found = sorted.find((t) => t.id === openScanTaskId)
    if (found) setScanTask(found)
    onOpenScanConsumed?.()
  }, [openScanTaskId, sorted, onOpenScanConsumed])

  function handleDone(result: OperatorScanDoneResult) {
    const finishedId = scanTask?.id ?? null
    setScanTask(null)
    if (result.queued) {
      setLiveMsg("Нет сети — подтверждение сохранено, будет отправлено позже")
      refresh()
    } else if (result.shortfall) {
      setLiveMsg("Отбор с недобором зафиксирован")
    } else if (result.outcome === "no_stock") {
      setLiveMsg("Инцидент зафиксирован")
    } else {
      setLiveMsg("Отбор подтверждён")
    }
    onRefresh({
      queued: result.queued,
      shortfall: result.shortfall,
      outcome: result.outcome,
    })
    // Авто-переход к следующему заданию оператора.
    const nxt = nextScannable(finishedId)
    if (nxt && result.outcome === "ok" && !result.queued) {
      window.setTimeout(() => setScanTask(nxt), 120)
    }
  }

  return (
    <div>
      <div
        className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-2"
        aria-live="polite"
      >
        <p className="text-sm text-muted-foreground">
          {sorted.length === 0
            ? "Нет открытых заданий"
            : `Открытых заданий: ${sorted.length}`}
          {liveMsg ? ` · ${liveMsg}` : ""}
        </p>
        {pending > 0 || !online ? (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-sm text-amber-800 dark:text-amber-300"
            role="status"
            aria-live="polite"
          >
            <FiCloudOff className="size-4 shrink-0" aria-hidden />
            <span>
              {!online
                ? "Офлайн"
                : `Не синхронизировано: ${pending}`}
            </span>
            {online && pending > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 min-w-11 px-3"
                disabled={syncing}
                onClick={() => void flush()}
                aria-label="Синхронизировать очередь"
              >
                <FiRefreshCw
                  className={cn("size-4", syncing && "animate-spin")}
                />
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="invisible min-h-11 text-sm" aria-hidden>
            —
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-3" aria-label="Мои задания">
        {sorted.map((task) => {
          const target = parseWarehouseTaskTarget(task.payload)
          const mine = task.assigned_user_id === currentUserId
          const canScan =
            task.task_type === "pick" && Boolean(orderIdOf(task))
          const highlighted =
            task.id === highlightTaskId || task.id === scanTask?.id
          const planned =
            typeof task.payload?.quantity === "number"
              ? task.payload.quantity
              : null
          return (
            <li key={task.id} id={`op-task-${task.id}`}>
              <article
                className={cn(
                  "rounded-lg border border-border bg-card p-4 shadow-sm",
                  highlighted && "ring-2 ring-primary",
                )}
                aria-current={highlighted ? "true" : undefined}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">
                    {getTaskTypeLabel(task.task_type)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                      STATUS_TONE_CLASS[getTaskStatusMeta(task.status).tone],
                    )}
                  >
                    {getTaskStatusLabel(task.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getPriorityLabel(task.priority)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  #{task.id.slice(0, 8)}
                  {typeof task.payload?.sku === "string"
                    ? ` · ${task.payload.sku}`
                    : ""}
                  {planned != null ? ` · ${planned} шт` : ""}
                </p>
                {target.slotKey ? (
                  <p className="mt-1 text-sm font-medium">
                    Ячейка {target.slotKey}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-col gap-2">
                  {!mine ? (
                    <Button
                      className="h-11 w-full text-base"
                      variant="outline"
                      loading={claiming}
                      onClick={() => onClaim(task.id)}
                    >
                      Взять в работу
                    </Button>
                  ) : null}
                  {mine && canScan ? (
                    <Button
                      className="h-11 w-full text-base"
                      onClick={() => setScanTask(task)}
                    >
                      <FiCamera className="mr-2 size-5" />
                      Отсканировать
                    </Button>
                  ) : null}
                  {mine && !canScan ? (
                    <p className="text-xs text-muted-foreground">
                      Для этого типа задания скан-подтверждение недоступно —
                      завершите через таблицу на десктопе или 3D.
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          )
        })}
      </ul>

      <OperatorTaskScanDialog
        open={scanTask != null}
        onOpenChange={(open) => {
          if (!open) setScanTask(null)
        }}
        task={scanTask}
        onDone={handleDone}
      />
    </div>
  )
}

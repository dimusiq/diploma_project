/**
 * Мобильный список «Мои задания»: крупные строки, скан, инцидент.
 */
import { useEffect, useMemo, useState } from "react"
import { FiCamera } from "react-icons/fi"
import type { WarehouseTask } from "@/api/warehouseTasks.ts"
import { Button } from "@/components/ui/button.tsx"
import { OperatorTaskScanDialog } from "@/components/warehouse/OperatorTaskScanDialog.tsx"
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
  onRefresh: () => void
  claiming?: boolean
  openScanTaskId?: string | null
  onOpenScanConsumed?: () => void
}) {
  const [scanTask, setScanTask] = useState<WarehouseTask | null>(null)

  const sorted = useMemo(() => {
    const open = tasks.filter(
      (t) => !["completed", "cancelled", "canceled"].includes(t.status),
    )
    open.sort((a, b) => {
      const aMine = a.assigned_user_id === currentUserId ? 0 : 1
      const bMine = b.assigned_user_id === currentUserId ? 0 : 1
      if (aMine !== bMine) return aMine - bMine
      return b.priority - a.priority
    })
    return open
  }, [tasks, currentUserId])

  useEffect(() => {
    if (!openScanTaskId) return
    const found = sorted.find((t) => t.id === openScanTaskId)
    if (found) setScanTask(found)
    onOpenScanConsumed?.()
  }, [openScanTaskId, sorted, onOpenScanConsumed])

  return (
    <div>
      <div
        className="mb-3 flex items-center justify-between gap-2"
        aria-live="polite"
      >
        <p className="text-sm text-muted-foreground">
          {sorted.length === 0
            ? "Нет открытых заданий"
            : `Открытых заданий: ${sorted.length}`}
        </p>
      </div>

      <ul className="flex flex-col gap-3" aria-label="Мои задания">
        {sorted.map((task) => {
          const target = parseWarehouseTaskTarget(task.payload)
          const mine = task.assigned_user_id === currentUserId
          const canScan =
            task.task_type === "pick" && Boolean(orderIdOf(task))
          const highlighted = task.id === highlightTaskId
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
        onDone={() => {
          setScanTask(null)
          onRefresh()
        }}
      />
    </div>
  )
}

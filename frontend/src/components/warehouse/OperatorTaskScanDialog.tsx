/**
 * Поток оператора: скан → подтверждение отбора или инцидент «нет товара».
 */
import { useCallback, useRef, useState } from "react"
import { FiAlertTriangle, FiHash, FiLoader } from "react-icons/fi"
import { scanApi } from "@/api/scan.ts"
import type { WarehouseTask } from "@/api/warehouseTasks.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { getErrorHttpStatus } from "@/lib/apiClient.ts"
import { parseWarehouseTaskTarget } from "@/lib/warehouseTaskTarget.ts"

function orderIdFromTask(task: WarehouseTask): string | null {
  const raw = task.payload?.order_id ?? task.payload?.orderId
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null
}

export function OperatorTaskScanDialog({
  open,
  onOpenChange,
  task,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: WarehouseTask | null
  onDone: (result: "ok" | "no_stock") => void
}) {
  const [code, setCode] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<"scan" | "incident">("scan")
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setCode("")
    setReason("")
    setError(null)
    setStep("scan")
    setLoading(false)
  }, [])

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  if (!task) return null

  const taskId = task.id
  const taskType = task.task_type
  const orderId = orderIdFromTask(task)
  const target = parseWarehouseTaskTarget(task.payload)
  const expectedSku =
    typeof task.payload?.sku === "string" ? task.payload.sku : null
  const slotKey = target.slotKey ?? null

  async function confirmOk() {
    const trimmed = code.trim()
    if (!trimmed) {
      setError("Введите или отсканируйте код товара")
      return
    }
    if (!orderId) {
      setError("У задания нет order_id — подтверждение сканом недоступно")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await scanApi.confirmPick({
        order_id: orderId,
        task_id: taskId,
        code: trimmed,
        outcome: "ok",
        scanned_slot_key: slotKey,
      })
      handleOpenChange(false)
      onDone("ok")
    } catch (err: unknown) {
      const status = getErrorHttpStatus(err)
      if (status === 404) {
        setError("Товар по коду не найден")
      } else if (status === 409) {
        setError(
          err instanceof Error
            ? err.message
            : "Скан не совпал с заданием",
        )
      } else {
        setError(
          err instanceof Error ? err.message : "Не удалось подтвердить отбор",
        )
      }
    } finally {
      setLoading(false)
    }
  }

  async function confirmNoStock() {
    if (!orderId) {
      setError("У задания нет order_id")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await scanApi.confirmPick({
        order_id: orderId,
        task_id: taskId,
        code: code.trim() || expectedSku || "NO_STOCK",
        outcome: "no_stock",
        reason: reason.trim() || "Нет товара в ячейке",
      })
      handleOpenChange(false)
      onDone("no_stock")
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Не удалось зафиксировать инцидент",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FiHash className="size-5" />
            {step === "scan" ? "Сканирование отбора" : "Инцидент: нет товара"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              {taskType} · #{taskId.slice(0, 8)}
            </p>
            {target.slotKey ? (
              <p className="text-muted-foreground">Ячейка: {target.slotKey}</p>
            ) : null}
            {expectedSku ? (
              <p className="text-muted-foreground">SKU: {expectedSku}</p>
            ) : null}
          </div>

          {step === "scan" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-scan-code">Штрихкод / SKU товара</Label>
                <Input
                  id="op-scan-code"
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void confirmOk()
                    }
                  }}
                  placeholder="Отсканируйте товар…"
                  className="h-11 text-base"
                  autoFocus
                  disabled={loading}
                />
              </div>
              {error ? (
                <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                  <FiAlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  disabled={loading || !code.trim()}
                  onClick={() => void confirmOk()}
                >
                  {loading ? (
                    <FiLoader className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Подтвердить отбор
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full border-orange-500 text-base text-orange-700 dark:text-orange-400"
                  disabled={loading}
                  onClick={() => {
                    setError(null)
                    setStep("incident")
                  }}
                >
                  Нет товара
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-incident-reason">Причина</Label>
                <Textarea
                  id="op-incident-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Пустая ячейка, брак, неверный SKU…"
                  className="min-h-24 text-base"
                  disabled={loading}
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  variant="destructive"
                  disabled={loading}
                  onClick={() => void confirmNoStock()}
                >
                  {loading ? (
                    <FiLoader className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Зафиксировать инцидент
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-base"
                  disabled={loading}
                  onClick={() => {
                    setError(null)
                    setStep("scan")
                  }}
                >
                  Назад к скану
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

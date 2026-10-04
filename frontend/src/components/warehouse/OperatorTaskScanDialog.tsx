/**
 * Полный операторский цикл: ячейка → товар → количество → подтверждение / инцидент.
 * При офлайне или сетевой ошибке — буфер в operatorPickQueue.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FiAlertTriangle, FiHash, FiLoader } from "react-icons/fi"
import type { ScanConfirmPickBody } from "@/api/scan.ts"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { getErrorHttpStatus } from "@/lib/apiClient.ts"
import {
  enqueueOperatorPick,
  isBrowserOffline,
} from "@/lib/operatorPickQueue.ts"
import { parseWarehouseTaskTarget } from "@/lib/warehouseTaskTarget.ts"
import { cn } from "@/lib/utils.ts"

export const INCIDENT_REASONS = [
  { value: "empty_slot", label: "Пустая ячейка" },
  { value: "shortage", label: "Недостача" },
  { value: "wrong_sku", label: "Пересорт (другой SKU)" },
  { value: "damage", label: "Брак / повреждение" },
  { value: "slot_blocked", label: "Ячейка недоступна" },
  { value: "other", label: "Другое" },
] as const

type Step = "slot" | "item" | "qty" | "confirm" | "incident"

function orderIdFromTask(task: WarehouseTask): string | null {
  const raw = task.payload?.order_id ?? task.payload?.orderId
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null
}

function plannedQty(task: WarehouseTask): number {
  const raw = task.payload?.quantity ?? task.payload?.qty
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

function normalizeCode(v: string): string {
  return v.trim().toLowerCase()
}

function codesMatch(scanned: string, expected: string | null | undefined): boolean {
  if (!expected) return true
  return normalizeCode(scanned) === normalizeCode(expected)
}

export type OperatorScanDoneResult = {
  outcome: "ok" | "no_stock"
  queued: boolean
  shortfall: boolean
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
  onDone: (result: OperatorScanDoneResult) => void
}) {
  const [step, setStep] = useState<Step>("slot")
  const [slotCode, setSlotCode] = useState("")
  const [itemCode, setItemCode] = useState("")
  const [qty, setQty] = useState("1")
  const [reasonKey, setReasonKey] = useState<string>("")
  const [reasonNote, setReasonNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState<string | null>(null)
  const [statusLive, setStatusLive] = useState("")
  const slotRef = useRef<HTMLInputElement>(null)
  const itemRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep("slot")
    setSlotCode("")
    setItemCode("")
    setQty("1")
    setReasonKey("")
    setReasonNote("")
    setError(null)
    setMismatch(null)
    setLoading(false)
    setStatusLive("")
  }, [])

  useEffect(() => {
    if (!open || !task) return
    reset()
    setQty(String(plannedQty(task)))
  }, [open, task, reset])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      if (step === "slot") slotRef.current?.focus()
      else if (step === "item") itemRef.current?.focus()
      else if (step === "qty") qtyRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(t)
  }, [open, step])

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const meta = useMemo(() => {
    if (!task) {
      return {
        orderId: null as string | null,
        slotKey: null as string | null,
        expectedSku: null as string | null,
        planned: 1,
        alternative: null as Record<string, unknown> | null,
      }
    }
    const target = parseWarehouseTaskTarget(task.payload)
    const alt =
      task.payload &&
      typeof task.payload.incident === "object" &&
      task.payload.incident != null &&
      typeof (task.payload.incident as { alternative?: unknown }).alternative ===
        "object"
        ? ((task.payload.incident as { alternative: Record<string, unknown> })
            .alternative ?? null)
        : null
    return {
      orderId: orderIdFromTask(task),
      slotKey: target.slotKey ?? null,
      expectedSku:
        typeof task.payload?.sku === "string" ? task.payload.sku : null,
      planned: plannedQty(task),
      alternative: alt,
    }
  }, [task])

  if (!task) return null

  const taskId = task.id
  const { orderId, slotKey, expectedSku, planned, alternative } = meta
  const qtyNum = Math.floor(Number(qty))
  const shortfall = Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum < planned

  function goItemFromSlot() {
    setError(null)
    setMismatch(null)
    const scanned = slotCode.trim()
    if (!scanned) {
      setError("Отсканируйте или введите код ячейки")
      return
    }
    if (slotKey && !codesMatch(scanned, slotKey)) {
      setMismatch(
        `Не совпала ячейка: ожидали «${slotKey}», получили «${scanned}»`,
      )
      setStatusLive("Ошибка: ячейка не совпала")
      return
    }
    setStatusLive("Ячейка подтверждена")
    setStep("item")
  }

  function goQtyFromItem() {
    setError(null)
    setMismatch(null)
    const scanned = itemCode.trim()
    if (!scanned) {
      setError("Отсканируйте или введите SKU / штрихкод товара")
      return
    }
    if (expectedSku && !codesMatch(scanned, expectedSku)) {
      const altSku =
        alternative && typeof alternative.sku === "string"
          ? alternative.sku
          : null
      const altSlot =
        alternative && typeof alternative.slot_key === "string"
          ? alternative.slot_key
          : null
      const hint =
        altSku || altSlot
          ? ` Альтернатива: SKU ${altSku ?? "—"}, ячейка ${altSlot ?? "—"}.`
          : ""
      setMismatch(
        `Не совпал товар: ожидали SKU «${expectedSku}», получили «${scanned}».${hint}`,
      )
      setStatusLive("Ошибка: товар не совпал")
      return
    }
    setStatusLive("Товар подтверждён")
    setStep("qty")
  }

  function goConfirmFromQty() {
    setError(null)
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      setError("Количество должно быть не меньше 1")
      return
    }
    setStep("confirm")
    setStatusLive(
      shortfall
        ? `Подтверждение недобора: ${qtyNum} из ${planned}`
        : `Подтверждение отбора: ${qtyNum} шт`,
    )
  }

  async function submitPick(body: ScanConfirmPickBody): Promise<"sent" | "queued"> {
    if (isBrowserOffline()) {
      enqueueOperatorPick(body)
      return "queued"
    }
    try {
      await scanApi.confirmPick(body)
      return "sent"
    } catch (err: unknown) {
      // Сетевые/5xx — в очередь; 4xx клиентские — пробрасываем.
      const status = getErrorHttpStatus(err)
      if (status == null || status >= 500) {
        enqueueOperatorPick(body)
        return "queued"
      }
      throw err
    }
  }

  async function confirmOk() {
    if (!orderId) {
      setError("У задания нет order_id — подтверждение сканом недоступно")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const mode = await submitPick({
        order_id: orderId,
        task_id: taskId,
        code: itemCode.trim(),
        outcome: "ok",
        scanned_slot_key: slotCode.trim() || slotKey,
        quantity: qtyNum,
      })
      handleOpenChange(false)
      onDone({
        outcome: "ok",
        queued: mode === "queued",
        shortfall,
      })
    } catch (err: unknown) {
      const status = getErrorHttpStatus(err)
      if (status === 404) {
        setError("Товар по коду не найден")
        setStep("item")
      } else if (status === 409) {
        const msg =
          err instanceof Error ? err.message : "Скан не совпал с заданием"
        setMismatch(msg)
        setStep("item")
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
    const reasonMeta = INCIDENT_REASONS.find((r) => r.value === reasonKey)
    if (!reasonMeta) {
      setError("Выберите причину из списка")
      return
    }
    if (reasonKey === "other" && !reasonNote.trim()) {
      setError("Укажите пояснение для причины «Другое»")
      return
    }
    const reason =
      reasonKey === "other"
        ? reasonNote.trim()
        : reasonNote.trim()
          ? `${reasonMeta.label}: ${reasonNote.trim()}`
          : reasonMeta.label

    setLoading(true)
    setError(null)
    try {
      const mode = await submitPick({
        order_id: orderId,
        task_id: taskId,
        code: itemCode.trim() || expectedSku || "NO_STOCK",
        outcome: "no_stock",
        reason,
        scanned_slot_key: slotCode.trim() || slotKey,
      })
      handleOpenChange(false)
      onDone({
        outcome: "no_stock",
        queued: mode === "queued",
        shortfall: false,
      })
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Не удалось зафиксировать инцидент",
      )
    } finally {
      setLoading(false)
    }
  }

  const stepTitle: Record<Step, string> = {
    slot: "1/4 · Скан ячейки",
    item: "2/4 · Скан товара",
    qty: "3/4 · Количество",
    confirm: "4/4 · Подтверждение",
    incident: "Инцидент",
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FiHash className="size-5" />
            {stepTitle[step]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          <div
            className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
            aria-live="polite"
          >
            <p className="font-medium">
              {task.task_type} · #{taskId.slice(0, 8)}
            </p>
            {slotKey ? (
              <p className="text-muted-foreground">Ячейка: {slotKey}</p>
            ) : null}
            {expectedSku ? (
              <p className="text-muted-foreground">SKU: {expectedSku}</p>
            ) : null}
            <p className="text-muted-foreground">План: {planned} шт</p>
            {statusLive ? (
              <p className="mt-1 text-xs text-foreground">{statusLive}</p>
            ) : null}
          </div>

          {mismatch ? (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <p className="flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{mismatch}</span>
              </p>
              {alternative && typeof alternative.slot_key === "string" ? (
                <p className="mt-2 text-foreground">
                  Предложенная ячейка:{" "}
                  <span className="font-medium">
                    {String(alternative.slot_key)}
                  </span>
                  {typeof alternative.sku === "string"
                    ? ` (SKU ${alternative.sku})`
                    : ""}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-11 w-full text-base"
                onClick={() => {
                  setMismatch(null)
                  setStep("incident")
                }}
              >
                Зафиксировать инцидент
              </Button>
            </div>
          ) : null}

          {error ? (
            <p
              className="flex items-start gap-2 text-sm text-destructive"
              role="alert"
            >
              <FiAlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {step === "slot" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-scan-slot">Код ячейки</Label>
                <Input
                  id="op-scan-slot"
                  ref={slotRef}
                  value={slotCode}
                  onChange={(e) => setSlotCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      goItemFromSlot()
                    }
                  }}
                  placeholder={slotKey ? `Ожидается ${slotKey}` : "Скан ячейки…"}
                  className="h-11 text-base"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  disabled={loading || !slotCode.trim()}
                  onClick={goItemFromSlot}
                >
                  Далее: товар
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full border-orange-500 text-base text-orange-700 dark:text-orange-400"
                  disabled={loading}
                  onClick={() => {
                    setError(null)
                    setMismatch(null)
                    setStep("incident")
                  }}
                >
                  Нет товара / инцидент
                </Button>
              </div>
            </>
          ) : null}

          {step === "item" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-scan-item">Штрихкод / SKU</Label>
                <Input
                  id="op-scan-item"
                  ref={itemRef}
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      goQtyFromItem()
                    }
                  }}
                  placeholder={
                    expectedSku ? `Ожидается ${expectedSku}` : "Скан товара…"
                  }
                  className="h-11 text-base"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  disabled={loading || !itemCode.trim()}
                  onClick={goQtyFromItem}
                >
                  Далее: количество
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-base"
                  disabled={loading}
                  onClick={() => setStep("slot")}
                >
                  Назад к ячейке
                </Button>
              </div>
            </>
          ) : null}

          {step === "qty" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-scan-qty">Фактическое количество</Label>
                <Input
                  id="op-scan-qty"
                  ref={qtyRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      goConfirmFromQty()
                    }
                  }}
                  className="h-11 text-base"
                  disabled={loading}
                />
                {shortfall ? (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Недобор: будет зафиксировано {qtyNum} из {planned}.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  disabled={loading}
                  onClick={goConfirmFromQty}
                >
                  Далее: подтверждение
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-base"
                  disabled={loading}
                  onClick={() => setStep("item")}
                >
                  Назад к товару
                </Button>
              </div>
            </>
          ) : null}

          {step === "confirm" ? (
            <>
              <div
                className={cn(
                  "rounded-md border px-3 py-3 text-sm",
                  shortfall
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-border bg-muted/30",
                )}
              >
                <p className="font-medium">Списать остаток и завершить задание?</p>
                <p className="mt-1 text-muted-foreground">
                  Ячейка {slotCode.trim() || slotKey || "—"} · SKU{" "}
                  {itemCode.trim() || expectedSku || "—"} · {qtyNum} шт
                  {shortfall ? ` (план ${planned})` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  disabled={loading}
                  onClick={() => void confirmOk()}
                >
                  {loading ? (
                    <FiLoader className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Подтвердить отбор
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-base"
                  disabled={loading}
                  onClick={() => setStep("qty")}
                >
                  Отмена
                </Button>
              </div>
            </>
          ) : null}

          {step === "incident" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-incident-reason">Причина (обязательно)</Label>
                <Select
                  value={reasonKey || undefined}
                  onValueChange={(v) => setReasonKey(v)}
                  disabled={loading}
                >
                  <SelectTrigger
                    id="op-incident-reason"
                    className="h-11 w-full text-base"
                  >
                    <SelectValue placeholder="Выберите причину…" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="op-incident-note">
                  {reasonKey === "other" ? "Пояснение (обязательно)" : "Комментарий"}
                </Label>
                <Input
                  id="op-incident-note"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  className="h-11 text-base"
                  disabled={loading}
                  placeholder="Кратко, что увидели…"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full text-base"
                  variant="destructive"
                  disabled={loading || !reasonKey}
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
                    setStep("slot")
                  }}
                >
                  Отмена
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

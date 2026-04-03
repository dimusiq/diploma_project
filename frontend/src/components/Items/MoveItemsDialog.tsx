import { useMutation, useQueryClient } from "@tanstack/react-query"
import { startTransition, useEffect, useMemo, useState } from "react"
import { ItemsService } from "@/client/index.ts"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Field } from "@/components/ui/field.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  getAllowedNextStatuses,
  getStatusLabel,
} from "@/utils/statusTransitions.ts"

const ALL_STATUSES = ["incoming", "warehouse", "shipment", "shipped"] as const

interface MoveItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  /** Товары с текущим статусом (для фильтра разрешённых целевых статусов). Если пусто — показываем все. */
  selectedItems?: { id: string; status: string }[]
  onSuccess: () => void
  /** Вызывается до мутации для оптимистичного удаления элементов из списка (useOptimistic). */
  onOptimisticRemove?: (ids: string[]) => void
}

export function MoveItemsDialog({
  open,
  onOpenChange,
  selectedIds,
  selectedItems = [],
  onSuccess,
  onOptimisticRemove,
}: MoveItemsDialogProps) {
  const allowedStatuses = useMemo(() => {
    if (selectedItems.length === 0) return ALL_STATUSES.slice()
    const nextSet = new Set<string>()
    selectedItems.forEach((s) =>
      getAllowedNextStatuses(s.status).forEach((t) => nextSet.add(t)),
    )
    return Array.from(nextSet)
  }, [selectedItems])

  const defaultTarget = allowedStatuses.includes("warehouse")
    ? "warehouse"
    : (allowedStatuses[0] ?? "warehouse")
  const hasAllowedTargets = allowedStatuses.length > 0
  const [targetStatus, setTargetStatus] = useState<string>(defaultTarget)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  useEffect(() => {
    if (open) {
      const next = allowedStatuses.includes(targetStatus)
        ? targetStatus
        : (allowedStatuses[0] ?? "warehouse")
      setTargetStatus(next)
    }
  }, [open, allowedStatuses, targetStatus])

  const mutation = useMutation({
    mutationFn: async (status: string) => {
      await Promise.all(
        selectedIds.map((id) =>
          ItemsService.updateItem({ id, requestBody: { status } }),
        ),
      )
    },
    onSuccess: () => {
      showSuccessToast(`Перемещено товаров: ${selectedIds.length}`)
      onSuccess()
      onOpenChange(false)
    },
    onError: (e: Error) => {
      showErrorToast(e.message || "Ошибка при перемещении")
    },
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const handleConfirm = () => {
    if (onOptimisticRemove) {
      onOptimisticRemove(selectedIds)
      startTransition(() => {
        mutation.mutateAsync(targetStatus).finally(() => {
          queryClient.invalidateQueries()
        })
      })
    } else {
      mutation.mutate(targetStatus)
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Переместить товары</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3 text-sm text-muted-foreground">
            Выбрано товаров: {selectedIds.length}. Укажите целевой статус.
          </p>
          {hasAllowedTargets ? (
            <Field label="Статус">
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="min-w-[180px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                {allowedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {getStatusLabel(value)}
                  </option>
                ))}
              </select>
              {targetStatus === "warehouse" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  У каждого товара должна быть указана ячейка хранения (ряд,
                  уровень, позиция) в карточке товара.
                </p>
              )}
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              Для выбранных товаров нет допустимых переходов (возможно, все уже
              отгружены).
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-wrap gap-2">
            <DialogActionTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button
              variant="solid"
              size="sm"
              onClick={handleConfirm}
              loading={mutation.isPending}
              disabled={mutation.isPending || !hasAllowedTargets}
            >
              Переместить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

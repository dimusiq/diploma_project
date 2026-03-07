import { Button, ButtonGroup, Field, Text } from "@chakra-ui/react"
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
} from "@/components/ui/dialog.tsx"
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
          <Text fontSize="sm" color="fg.muted" mb={3}>
            Выбрано товаров: {selectedIds.length}. Укажите целевой статус.
          </Text>
          {hasAllowedTargets ? (
            <Field.Root>
              <Field.Label>Статус</Field.Label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--chakra-colors-border)",
                  minWidth: "180px",
                  fontSize: "14px",
                }}
              >
                {allowedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {getStatusLabel(value)}
                  </option>
                ))}
              </select>
              {targetStatus === "warehouse" && (
                <Text fontSize="xs" color="fg.muted" mt={2}>
                  У каждого товара должна быть указана ячейка хранения (ряд,
                  уровень, позиция) в карточке товара.
                </Text>
              )}
            </Field.Root>
          ) : (
            <Text fontSize="sm" color="fg.muted">
              Для выбранных товаров нет допустимых переходов (возможно, все уже
              отгружены).
            </Text>
          )}
        </DialogBody>
        <DialogFooter>
          <ButtonGroup>
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
          </ButtonGroup>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

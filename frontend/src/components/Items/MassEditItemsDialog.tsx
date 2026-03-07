import { Button, ButtonGroup, Field, Input } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { CategoriesService, ItemsService } from "@/client/index.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

interface MassEditItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  onSuccess: () => void
}

export function MassEditItemsDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: MassEditItemsDialogProps) {
  const [categoryId, setCategoryId] = useState<string>("")
  const [unit, setUnit] = useState<string>("")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: async (payload: {
      category_id?: string | null
      unit?: string | null
    }) => {
      const body: { category_id?: string | null; unit?: string | null } = {}
      if (payload.category_id !== undefined)
        body.category_id = payload.category_id || null
      if (payload.unit !== undefined) body.unit = payload.unit || null
      await Promise.all(
        selectedIds.map((id) =>
          ItemsService.updateItem({ id, requestBody: body }),
        ),
      )
    },
    onSuccess: () => {
      showSuccessToast(`Обновлено товаров: ${selectedIds.length}`)
      onSuccess()
      onOpenChange(false)
      setCategoryId("")
      setUnit("")
    },
    onError: (e: Error) => {
      showErrorToast(e.message || "Ошибка при обновлении")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const hasChange = categoryId !== "" || unit.trim() !== ""

  const handleApply = () => {
    if (!hasChange) return
    mutation.mutate({
      category_id: categoryId || undefined,
      unit: unit.trim() || undefined,
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Изменить выбранные ({selectedIds.length})</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field.Root>
            <Field.Label>Категория</Field.Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--chakra-colors-border)",
                width: "100%",
                fontSize: "14px",
              }}
            >
              <option value="">— Не менять</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field.Root>
          <Field.Root mt={3}>
            <Field.Label>Единица измерения</Field.Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="— Не менять"
              size="sm"
            />
          </Field.Root>
        </DialogBody>
        <DialogFooter>
          <ButtonGroup>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              variant="solid"
              size="sm"
              onClick={handleApply}
              disabled={!hasChange || mutation.isPending}
              loading={mutation.isPending}
            >
              Применить
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

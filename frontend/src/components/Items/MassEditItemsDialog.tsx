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
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Field } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
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
          <Field label="Категория">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            >
              <option value="">— Не менять</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Единица измерения" className="mt-3">
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="— Не менять"
              className="h-8 text-sm"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

/** Массовые операции над выбранными сотрудниками. */

import { useState } from "react"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"

export function PersonnelBulkBar({
  selectedCount,
  canEdit,
  departments,
  departmentsLoading,
  moving,
  deleting,
  onClear,
  onMove,
  onDelete,
}: {
  selectedCount: number
  canEdit: boolean
  departments: string[]
  departmentsLoading?: boolean
  moving?: boolean
  deleting?: boolean
  onClear: () => void
  onMove: (department: string) => void
  onDelete: () => void
}) {
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [department, setDepartment] = useState("")

  if (selectedCount <= 0 || !canEdit) return null

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
        data-testid="personnel-bulk-bar"
      >
        <span className="text-sm font-medium">Выбрано: {selectedCount}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDepartment(departments[0] ?? "")
              setMoveOpen(true)
            }}
          >
            Переместить в подразделение
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outlineDestructive"
            onClick={() => setDeleteOpen(true)}
          >
            Удалить
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Снять выбор
          </Button>
        </div>
      </div>

      <Dialog
        open={moveOpen}
        onOpenChange={(open) => {
          setMoveOpen(open)
          if (!open) setDepartment("")
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="personnel-bulk-move-dialog">
          <DialogHeader>
            <DialogTitle>Переместить сотрудников</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Выбрано сотрудников: {selectedCount}
          </p>
          <label className="grid gap-1 text-sm">
            Новое подразделение
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger aria-label="Новое подразделение">
                <SelectValue placeholder={departmentsLoading ? "Загрузка…" : "Выберите"} />
              </SelectTrigger>
              <SelectContent>
                {departments.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!department || moving}
              onClick={() => {
                onMove(department)
                setMoveOpen(false)
              }}
            >
              Переместить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить сотрудников?"
        description={`Будет удалено сотрудников: ${selectedCount}. Действие нельзя отменить.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleting}
        onConfirm={() => {
          onDelete()
          setDeleteOpen(false)
        }}
      />
    </>
  )
}

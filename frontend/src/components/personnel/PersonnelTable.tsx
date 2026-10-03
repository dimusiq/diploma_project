import { useMemo, useState } from "react"
import { FiEdit2, FiTrash2 } from "react-icons/fi"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx"
import {
  employeeStatusLabel,
  formatStatusDate,
  fullName,
  motionLabel,
  shiftLabel,
  zoneLabel,
  type PersonnelRecord,
} from "@/lib/personnel.ts"

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sick") return "destructive"
  if (status === "vacation") return "outline"
  if (status === "break") return "secondary"
  return "default"
}

export function PersonnelTable({
  rows,
  canEdit,
  selectedIds,
  onSelectedIdsChange,
  onEdit,
  onDelete,
}: {
  rows: PersonnelRecord[]
  canEdit: boolean
  selectedIds: Set<string>
  onSelectedIdsChange: (next: Set<string>) => void
  onEdit: (row: PersonnelRecord) => void
  onDelete: (row: PersonnelRecord) => void
}) {
  const [pending, setPending] = useState<PersonnelRecord | null>(null)
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id))
  const headerState: boolean | "indeterminate" =
    visibleIds.length === 0
      ? false
      : selectedVisible.length === 0
        ? false
        : selectedVisible.length === visibleIds.length
          ? true
          : "indeterminate"

  const toggleAllVisible = (checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) {
      for (const id of visibleIds) next.add(id)
    } else {
      for (const id of visibleIds) next.delete(id)
    }
    onSelectedIdsChange(next)
  }

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    onSelectedIdsChange(next)
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Выбрать всех видимых"
                checked={headerState}
                disabled={visibleIds.length === 0}
                onCheckedChange={(checked) => toggleAllVisible(checked)}
              />
            </TableHead>
            <TableHead>Сотрудник</TableHead>
            <TableHead>Табельный номер</TableHead>
            <TableHead>Должность</TableHead>
            <TableHead>Подразделение</TableHead>
            <TableHead>Смена</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Текущая зона</TableHead>
            <TableHead>Состояние</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-muted-foreground">
                Сотрудники не найдены
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => {
            const until = formatStatusDate(row.status_until)
            return (
              <TableRow key={row.id} data-testid="personnel-row">
                <TableCell>
                  <Checkbox
                    aria-label={`Выбрать ${fullName(row)}`}
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={(checked) => toggleOne(row.id, checked)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </TableCell>
                <TableCell className="font-medium">{fullName(row)}</TableCell>
                <TableCell className="font-mono text-xs">{row.employee_code}</TableCell>
                <TableCell>{row.position}</TableCell>
                <TableCell>{row.department}</TableCell>
                <TableCell>{shiftLabel(row.shift)}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    <Badge variant={statusVariant(row.status)}>{employeeStatusLabel(row.status)}</Badge>
                    {until ? <span className="text-xs text-muted-foreground">до {until}</span> : null}
                  </div>
                </TableCell>
                <TableCell>{zoneLabel(row.current_zone)}</TableCell>
                <TableCell>{motionLabel(row.motion_status)}</TableCell>
                <TableCell>
                  {canEdit ? (
                    <div className="flex gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Редактировать"
                            onClick={() => onEdit(row)}
                          >
                            <FiEdit2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Редактировать</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Удалить"
                            onClick={() => setPending(row)}
                          >
                            <FiTrash2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Удалить</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Удалить сотрудника?"
        description="Сотрудник будет удалён из списка персонала."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        onConfirm={() => {
          if (pending) onDelete(pending)
          setPending(null)
        }}
      />
    </>
  )
}

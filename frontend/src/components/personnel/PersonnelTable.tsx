import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  employeeStatusLabel,
  fullName,
  motionLabel,
  shiftLabel,
  zoneLabel,
  type PersonnelRecord,
} from "@/lib/personnel.ts"

export function PersonnelTable({
  rows,
  canEdit,
  onOpen,
  onEdit,
  onDeactivate,
}: {
  rows: PersonnelRecord[]
  canEdit: boolean
  onOpen: (row: PersonnelRecord) => void
  onEdit: (row: PersonnelRecord) => void
  onDeactivate: (row: PersonnelRecord) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
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
            <TableCell colSpan={9} className="text-muted-foreground">
              Сотрудники не найдены
            </TableCell>
          </TableRow>
        ) : null}
        {rows.map((row) => (
          <TableRow key={row.id} data-testid="personnel-row">
            <TableCell className="font-medium">{fullName(row)}</TableCell>
            <TableCell className="font-mono text-xs">{row.employee_code}</TableCell>
            <TableCell>{row.position}</TableCell>
            <TableCell>{row.department}</TableCell>
            <TableCell>{shiftLabel(row.shift)}</TableCell>
            <TableCell>
              <Badge variant={row.status === "active" ? "default" : "secondary"}>
                {employeeStatusLabel(row.status)}
              </Badge>
            </TableCell>
            <TableCell>{zoneLabel(row.current_zone)}</TableCell>
            <TableCell>{motionLabel(row.motion_status)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(row)}>
                  Открыть
                </Button>
                {canEdit ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(row)}>
                    Изменить
                  </Button>
                ) : null}
                {canEdit && row.status !== "inactive" && row.status !== "terminated" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDeactivate(row)}>
                    Деактивировать
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

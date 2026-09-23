import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  EMPLOYEE_POSITIONS,
  EMPLOYEE_SHIFTS,
  EMPLOYEE_STATUSES,
  type PersonnelFilters as Filters,
} from "@/lib/personnel.ts"
import { employeeStatusLabel, shiftLabel } from "@/lib/personnel.ts"

const ALL = "all"

export function PersonnelFilters({
  value,
  onChange,
}: {
  value: Filters
  onChange: (next: Filters) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value.q}
        placeholder="Поиск"
        aria-label="Поиск"
        className="w-56"
        onChange={(event) => onChange({ ...value, q: event.target.value })}
      />
      <Select
        value={value.position || ALL}
        onValueChange={(position) => onChange({ ...value, position: position === ALL ? "" : position })}
      >
        <SelectTrigger className="w-48" aria-label="Должность">
          <SelectValue placeholder="Должность" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все должности</SelectItem>
          {EMPLOYEE_POSITIONS.map((position) => (
            <SelectItem key={position} value={position}>
              {position}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.shift || ALL}
        onValueChange={(shift) => onChange({ ...value, shift: shift === ALL ? "" : shift })}
      >
        <SelectTrigger className="w-40" aria-label="Смена">
          <SelectValue placeholder="Смена" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все смены</SelectItem>
          {EMPLOYEE_SHIFTS.map((shift) => (
            <SelectItem key={shift} value={shift}>
              {shiftLabel(shift)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.status || ALL}
        onValueChange={(status) => onChange({ ...value, status: status === ALL ? "" : status })}
      >
        <SelectTrigger className="w-40" aria-label="Статус">
          <SelectValue placeholder="Статус" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все статусы</SelectItem>
          {EMPLOYEE_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {employeeStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

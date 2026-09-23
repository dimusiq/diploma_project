import { useState } from "react"
import { Button } from "@/components/ui/button.tsx"
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
  shiftLabel,
  employeeStatusLabel,
  type PersonnelRecord,
} from "@/lib/personnel.ts"
import type { PersonnelWrite } from "@/api/personnel.ts"

const EMPTY: PersonnelWrite = {
  employee_code: "",
  first_name: "",
  last_name: "",
  middle_name: "",
  position: "Кладовщик",
  department: "Склад №1",
  phone: "",
  email: "",
  status: "active",
  shift: "day",
  hire_date: "",
  notes: "",
}

function fromRecord(row: PersonnelRecord | null): PersonnelWrite {
  if (!row) return { ...EMPTY }
  return {
    employee_code: row.employee_code,
    first_name: row.first_name,
    last_name: row.last_name,
    middle_name: row.middle_name ?? "",
    position: row.position,
    department: row.department,
    phone: row.phone ?? "",
    email: row.email ?? "",
    status: row.status,
    shift: row.shift,
    hire_date: row.hire_date ?? "",
    notes: row.notes ?? "",
  }
}

export function PersonnelForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial: PersonnelRecord | null
  submitting: boolean
  onSubmit: (body: PersonnelWrite) => void
}) {
  const [value, setValue] = useState<PersonnelWrite>(() => fromRecord(initial))
  const set = (patch: Partial<PersonnelWrite>) => setValue((current) => ({ ...current, ...patch }))

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          ...value,
          hire_date: value.hire_date || null,
          middle_name: value.middle_name || null,
          phone: value.phone || null,
          email: value.email || null,
          notes: value.notes || null,
        })
      }}
    >
      <label className="grid gap-1 text-sm">
        Табельный номер
        <Input
          required
          value={value.employee_code}
          onChange={(event) => set({ employee_code: event.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Фамилия
          <Input required value={value.last_name} onChange={(event) => set({ last_name: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          Имя
          <Input required value={value.first_name} onChange={(event) => set({ first_name: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          Отчество
          <Input value={value.middle_name ?? ""} onChange={(event) => set({ middle_name: event.target.value })} />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Должность
        <Select value={value.position} onValueChange={(position) => set({ position })}>
          <SelectTrigger aria-label="Должность сотрудника">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYEE_POSITIONS.map((position) => (
              <SelectItem key={position} value={position}>
                {position}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-sm">
        Подразделение
        <Input required value={value.department} onChange={(event) => set({ department: event.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Смена
          <Select value={value.shift} onValueChange={(shift) => set({ shift })}>
            <SelectTrigger aria-label="Смена сотрудника">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYEE_SHIFTS.map((shift) => (
                <SelectItem key={shift} value={shift}>
                  {shiftLabel(shift)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          Статус
          <Select value={value.status} onValueChange={(status) => set({ status })}>
            <SelectTrigger aria-label="Статус сотрудника">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYEE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {employeeStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Телефон
          <Input value={value.phone ?? ""} onChange={(event) => set({ phone: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          Email
          <Input type="email" value={value.email ?? ""} onChange={(event) => set({ email: event.target.value })} />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Дата приёма
        <Input type="date" value={value.hire_date ?? ""} onChange={(event) => set({ hire_date: event.target.value })} />
      </label>
      <label className="grid gap-1 text-sm">
        Заметки
        <Input value={value.notes ?? ""} onChange={(event) => set({ notes: event.target.value })} />
      </label>
      <Button type="submit" disabled={submitting}>
        Сохранить
      </Button>
    </form>
  )
}

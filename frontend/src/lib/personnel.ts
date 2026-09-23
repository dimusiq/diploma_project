import {
  EMPLOYEE_STATUS_LABELS,
  PERSON_ZONE_LABELS,
  PERSONNEL_MOTION_LABELS,
  SHIFT_LABELS,
} from "@/lib/statusLabels.ts"

export const EMPLOYEE_POSITIONS = [
  "Кладовщик",
  "Старший кладовщик",
  "Комплектовщик",
  "Водитель погрузчика",
  "Оператор склада",
  "Начальник смены",
  "Контролёр",
  "Инженер",
] as const

export const EMPLOYEE_SHIFTS = ["morning", "day", "night"] as const
export const EMPLOYEE_STATUSES = ["active", "inactive", "on_leave", "terminated"] as const

export interface PersonnelRecord {
  id: string
  employee_code: string
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string
  department: string
  phone?: string | null
  email?: string | null
  status: string
  shift: string
  hire_date?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
  current_zone?: string | null
  motion_status?: string | null
  person_code?: string | null
  speed?: number | null
}

export interface PersonnelFilters {
  q: string
  position: string
  shift: string
  status: string
}

export const EMPTY_FILTERS: PersonnelFilters = {
  q: "",
  position: "",
  shift: "",
  status: "",
}

export function fullName(person: Pick<PersonnelRecord, "last_name" | "first_name" | "middle_name">): string {
  return [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(" ")
}

export function shortPersonName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return name
  const initials = parts.slice(1).map((part) => `${part[0]}.`).join("")
  return `${parts[0]} ${initials}`
}

export function employeeStatusLabel(status: string | null | undefined): string {
  if (!status) return "—"
  return EMPLOYEE_STATUS_LABELS[status] ?? status
}

export function shiftLabel(shift: string | null | undefined): string {
  if (!shift) return "—"
  return SHIFT_LABELS[shift] ?? shift
}

export function zoneLabel(zone: string | null | undefined): string {
  if (!zone) return "—"
  return PERSON_ZONE_LABELS[zone] ?? zone
}

export function motionLabel(status: string | null | undefined): string {
  if (!status) return "—"
  return PERSONNEL_MOTION_LABELS[status] ?? status
}

export function filterPersonnel(rows: PersonnelRecord[], filters: PersonnelFilters): PersonnelRecord[] {
  const query = filters.q.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false
    if (filters.position && row.position !== filters.position) return false
    if (filters.shift && row.shift !== filters.shift) return false
    if (!query) return true
    const haystack = [fullName(row), row.employee_code, row.position, row.department, row.shift]
      .join(" ")
      .toLowerCase()
    return haystack.includes(query)
  })
}

export interface DetectionLike {
  class_name: string
  track_id?: string | null
  entity_id?: string | null
  confidence: number
}

export interface TrackedPerson {
  id: string
  code?: string | null
  displayName?: string | null
}

export function describeDetection(item: DetectionLike, workers: TrackedPerson[]): { primary: string; detail: string } {
  if (item.class_name !== "person") {
    const track = item.track_id ? ` #${item.track_id}` : ""
    return {
      primary: `${item.class_name.toUpperCase()}${track}`,
      detail: item.confidence.toFixed(2),
    }
  }
  const id = item.entity_id || item.track_id
  const worker = workers.find((row) => row.id === id || (row.code != null && row.code === id))
  if (worker?.displayName) {
    return { primary: shortPersonName(worker.displayName), detail: item.confidence.toFixed(2) }
  }
  return { primary: "Неизвестный человек", detail: item.confidence.toFixed(2) }
}

/**
 * Реестр категорий оборудования. Источник истины — backend GET /fleet.catalog,
 * этот модуль — fallback и колонки/иконки для UI.
 */

import type { LucideIcon } from "lucide-react"
import {
  BatteryCharging,
  Camera,
  Cpu,
  DoorOpen,
  Forklift,
  LayoutGrid,
  ScanLine,
  Thermometer,
  Watch,
  Workflow,
} from "lucide-react"

export const EQUIPMENT_CATEGORIES = [
  { id: "all", label: "Всё" },
  { id: "transport", label: "Транспорт" },
  { id: "scanner", label: "Сканеры" },
  { id: "conveyor", label: "Конвейеры" },
  { id: "sensor", label: "Датчики" },
  { id: "gate", label: "Ворота" },
  { id: "charging", label: "Зарядные станции" },
  { id: "personnel_bracelets", label: "Браслеты персонала" },
  { id: "smart_cameras", label: "Умные камеры" },
  { id: "other", label: "Прочее" },
] as const

export type EquipmentCategoryId =
  (typeof EQUIPMENT_CATEGORIES)[number]["id"]

export const CATEGORY_ICONS: Record<EquipmentCategoryId, LucideIcon> = {
  all: LayoutGrid,
  transport: Forklift,
  scanner: ScanLine,
  conveyor: Workflow,
  sensor: Thermometer,
  gate: DoorOpen,
  charging: BatteryCharging,
  personnel_bracelets: Watch,
  smart_cameras: Camera,
  other: Cpu,
}

export const CATEGORY_COLUMNS: Record<string, string[]> = {
  all: ["name", "code", "kind", "zone", "status", "task", "maintenance", "enabled", "actions"],
  transport: [
    "name",
    "code",
    "kind",
    "zone",
    "status",
    "battery",
    "smart_camera",
    "task",
    "maintenance",
    "enabled",
    "actions",
  ],
  scanner: ["name", "code", "kind", "zone", "status", "enabled", "actions"],
  conveyor: ["name", "code", "zone", "status", "enabled", "actions"],
  sensor: [
    "name",
    "code",
    "subtype",
    "zone",
    "status",
    "value",
    "unit",
    "enabled",
    "actions",
  ],
  gate: ["name", "code", "zone", "status", "enabled", "actions"],
  charging: ["name", "code", "zone", "status", "enabled", "actions"],
  personnel_bracelets: [
    "name",
    "code",
    "status",
    "assignee",
    "last_signal",
    "battery",
    "enabled",
    "actions",
  ],
  smart_cameras: [
    "name",
    "code",
    "status",
    "mounted_on",
    "last_signal",
    "enabled",
    "actions",
  ],
  other: ["name", "code", "kind", "zone", "status", "enabled", "actions"],
}

export const COLUMN_LABELS: Record<string, string> = {
  name: "Оборудование",
  code: "Код",
  kind: "Тип",
  subtype: "Тип",
  zone: "Зона",
  status: "Состояние",
  battery: "Батарея",
  task: "Текущая задача",
  maintenance: "ТО",
  value: "Значение",
  unit: "Единица",
  enabled: "Активно",
  actions: "Действия",
  assignee: "Кому выдан",
  last_signal: "Последняя связь",
  smart_camera: "Умная камера",
  mounted_on: "Закреплена за",
}

export const KIND_TO_CATEGORY: Record<string, EquipmentCategoryId> = {
  agv: "transport",
  amr: "transport",
  forklift: "transport",
  scanner: "scanner",
  conveyor: "conveyor",
  sensor: "sensor",
  dock_door: "gate",
  charger: "charging",
  radio_beacon: "personnel_bracelets",
  smart_camera: "smart_cameras",
}

export const KIND_FIELDS: Record<string, string[]> = {
  agv: ["name", "code", "description", "zoneId", "enabled", "speed", "battery"],
  amr: ["name", "code", "description", "zoneId", "enabled", "speed", "battery"],
  forklift: [
    "name",
    "code",
    "description",
    "zoneId",
    "enabled",
    "speed",
    "battery",
  ],
  scanner: ["name", "code", "description", "zoneId", "enabled"],
  conveyor: ["name", "code", "description", "zoneId", "enabled"],
  sensor: [
    "name",
    "code",
    "description",
    "zoneId",
    "enabled",
    "metricKind",
    "metricUnit",
    "metricMin",
    "metricMax",
  ],
  dock_door: ["name", "code", "description", "zoneId", "enabled"],
  charger: ["name", "code", "description", "zoneId", "enabled"],
  radio_beacon: [
    "name",
    "code",
    "description",
    "zoneId",
    "enabled",
    "battery",
    "serialNumber",
  ],
  smart_camera: [
    "name",
    "code",
    "description",
    "zoneId",
    "enabled",
    "serialNumber",
  ],
}

export function categoryOf(kind: string): EquipmentCategoryId {
  return KIND_TO_CATEGORY[kind] ?? "other"
}

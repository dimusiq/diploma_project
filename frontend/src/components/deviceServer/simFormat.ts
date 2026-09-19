/** Подписи и форматирование для интерфейса симулятора. */

import {
  getDeviceStatusLabel,
  getOrderStatusLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
  getTruckStatusLabel,
  getWorkerStatusLabel,
} from "@/lib/statusLabels.ts"
import type {
  DeviceKind,
  DeviceStatus,
  OutboundStatus,
  SimEventSeverity,
  TaskKind,
  TaskStatus,
  TruckStatus,
  WorkerRole,
  WorkerStatus,
} from "./simTypes.ts"

const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  forklift: "Погрузчик",
  agv: "AGV",
  amr: "AMR-робот",
  conveyor: "Конвейер",
  scanner: "Сканер",
  sensor: "Датчик",
  terminal: "Терминал",
  dock_door: "Ворота",
  charger: "Зарядная станция",
  printer: "Принтер",
}

const WORKER_ROLE_LABELS: Record<WorkerRole, string> = {
  receiver: "Приёмка",
  picker: "Отборщик",
  loader: "Грузчик",
  operator: "Оператор",
  supervisor: "Бригадир",
}

export function deviceKindLabel(kind: DeviceKind): string {
  return DEVICE_KIND_LABELS[kind]
}

export function deviceStatusLabel(status: DeviceStatus): string {
  return getDeviceStatusLabel(status)
}

export function taskStatusLabel(status: TaskStatus): string {
  return getTaskStatusLabel(status)
}

export function taskKindLabel(kind: TaskKind): string {
  return getTaskTypeLabel(kind)
}

export function isMobileKind(kind: DeviceKind): boolean {
  return kind === "forklift" || kind === "agv" || kind === "amr"
}

export function outboundStatusLabel(status: OutboundStatus): string {
  return getOrderStatusLabel(status)
}

export function truckStatusLabel(status: TruckStatus): string {
  return getTruckStatusLabel(status)
}

export function workerRoleLabel(role: WorkerRole): string {
  return WORKER_ROLE_LABELS[role]
}

export function workerStatusLabel(status: WorkerStatus): string {
  return getWorkerStatusLabel(status)
}

/** Модельные часы: сутки смены + время суток. */
export function formatSimClock(timeSec: number, dayStartSec: number): string {
  const total = dayStartSec + Math.floor(timeSec)
  const day = Math.floor(total / 86400) + 1
  const rest = total % 86400
  const hh = String(Math.floor(rest / 3600)).padStart(2, "0")
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, "0")
  const ss = String(rest % 60).padStart(2, "0")
  return `Сутки ${day}, ${hh}:${mm}:${ss}`
}

export function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds))
  if (value < 60) return `${value} с`
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  return `${hours} ч ${minutes % 60} мин`
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Классы Tailwind для статуса устройства. */
export function deviceStatusTone(status: DeviceStatus): string {
  switch (status) {
    case "fault":
    case "jam":
      return "bg-destructive/15 text-destructive"
    case "maintenance":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    case "offline":
      return "bg-muted text-muted-foreground"
    case "waiting":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    case "charging":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400"
    case "idle":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
  }
}

export function severityTone(severity: SimEventSeverity): string {
  switch (severity) {
    case "error":
      return "text-destructive"
    case "warning":
      return "text-amber-600 dark:text-amber-400"
    case "success":
      return "text-emerald-600 dark:text-emerald-400"
    default:
      return "text-muted-foreground"
  }
}

export function severityDot(severity: SimEventSeverity): string {
  switch (severity) {
    case "error":
      return "bg-destructive"
    case "warning":
      return "bg-amber-500"
    case "success":
      return "bg-emerald-500"
    default:
      return "bg-sky-500"
  }
}

export function orderStatusTone(status: OutboundStatus): string {
  switch (status) {
    case "backorder":
      return "bg-destructive/15 text-destructive"
    case "shipped":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    case "new":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400"
  }
}

import type { SimEvent } from "@/components/deviceServer/simTypes.ts"

export const OPERATOR_EVENT_CATEGORIES = [
  "all",
  "errors",
  "equipment",
  "warehouse",
  "orders",
  "simulation",
  "system",
] as const

export type OperatorEventCategory = (typeof OPERATOR_EVENT_CATEGORIES)[number]

export const OPERATOR_EVENT_CATEGORY_LABELS: Record<
  OperatorEventCategory,
  string
> = {
  all: "Все",
  errors: "Аварии",
  equipment: "Оборудование",
  warehouse: "Склад",
  orders: "Заказы",
  simulation: "Симуляция",
  system: "Система",
}

function typeOf(event: Pick<SimEvent, "type">): string {
  return event.type.toUpperCase()
}

export function matchesEventCategory(
  event: Pick<SimEvent, "type" | "severity">,
  category: OperatorEventCategory,
): boolean {
  if (category === "all") return true
  const type = typeOf(event)
  if (category === "errors") {
    return (
      event.severity === "error" ||
      type.includes("ERROR") ||
      type.includes("FAILED") ||
      type.includes("ALARM") ||
      type === "EMERGENCY_STOP" ||
      type === "SCAN_FAILED"
    )
  }
  if (category === "equipment") {
    return (
      type.startsWith("DEVICE_") ||
      type.startsWith("AGV_") ||
      type.startsWith("CONVEYOR_") ||
      type === "WORKER_BREAK"
    )
  }
  if (category === "orders") {
    return (
      type.startsWith("ORDER_") ||
      type.startsWith("PICKING_") ||
      type === "ITEM_SHIPPED" ||
      type === "ITEM_PACKED"
    )
  }
  if (category === "warehouse") {
    return (
      type.startsWith("TASK_") ||
      type.startsWith("ZONE_") ||
      type.startsWith("RECEIVING_") ||
      type === "ITEM_STORED" ||
      type === "ITEM_PICKED" ||
      type === "ITEM_RECEIVED" ||
      type === "ITEM_SCANNED" ||
      type === "STORAGE_FULL" ||
      type === "TRUCK_ARRIVED" ||
      type === "TRUCK_DEPARTED"
    )
  }
  if (category === "simulation") {
    return (
      type.startsWith("SCENARIO_") ||
      type.startsWith("DEMO_") ||
      type === "SENSOR_READING" ||
      type === "SENSOR_ALARM"
    )
  }
  return (
    type.startsWith("SYSTEM_") ||
    type === "EMERGENCY_STOP"
  )
}

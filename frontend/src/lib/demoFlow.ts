/** Presentation steps of the live demo. Derived from event types, does not drive the runtime. */

export const DEMO_FLOW = [
  { id: "truck_arrived", title: "Прибытие", types: ["TRUCK_ARRIVED"] },
  { id: "receiving", title: "Приёмка", types: ["RECEIVING_STARTED", "ITEM_RECEIVED"] },
  { id: "scan", title: "Сканирование", types: ["ITEM_SCANNED", "SCAN_FAILED"] },
  { id: "inventory", title: "Остатки", types: ["INVENTORY_UPDATED"] },
  { id: "putaway", title: "Размещение", types: ["PUTAWAY_STARTED", "ITEM_STORED"] },
  { id: "agv", title: "AGV", types: ["AGV_MOVING", "AGV_LOADED", "DEVICE_MOVING"] },
  { id: "storage", title: "Хранение", types: ["STORAGE_ASSIGNED"] },
  { id: "order", title: "Заказ", types: ["ORDER_CREATED"] },
  { id: "picking", title: "Отбор", types: ["PICKING_STARTED", "ITEM_PICKED"] },
  { id: "packing", title: "Упаковка", types: ["ITEM_PACKED"] },
  { id: "shipment", title: "Отгрузка", types: ["SHIPMENT_READY"] },
  { id: "loading", title: "Погрузка", types: ["LOADING_STARTED"] },
  { id: "truck_departed", title: "Отправление", types: ["TRUCK_DEPARTED", "ITEM_SHIPPED"] },
] as const

const TYPE_TO_STEP = new Map<string, number>()
DEMO_FLOW.forEach((step, index) => {
  for (const type of step.types) TYPE_TO_STEP.set(type, index)
})

export function demoStepFromEvents(
  events: Array<{ type: string }>,
): { index: number; title: string; total: number } | null {
  let best = -1
  for (const event of events) {
    const index = TYPE_TO_STEP.get(event.type.toUpperCase())
    if (index != null && index > best) best = index
  }
  if (best < 0) return null
  const step = DEMO_FLOW[best]
  return { index: best, title: step.title, total: DEMO_FLOW.length }
}

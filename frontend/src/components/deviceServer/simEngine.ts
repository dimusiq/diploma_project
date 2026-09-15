/**
 * Ядро симуляции склада: один шаг модельного времени прогоняет все процессы —
 * прибытие транспорта, приёмку, размещение, генерацию и сборку заказов,
 * упаковку, отгрузку, заряд батарей, отказы техники и телеметрию датчиков.
 *
 * Все функции работают с изменяемым объектом `SimWorld`: состояние меняется
 * на месте, наружу выдаются только события и снимки (см. `simStore.ts`).
 */

import {
  distance,
  PACKING_POINT,
  RECEIVING_STAGING,
  routeBetween,
  SHIPPING_STAGING,
  ZONE_PACKING,
  ZONE_RECEIVING,
  ZONE_SHIPPING,
  ZONE_STORAGE,
} from "./simLayout.ts"
import {
  eventOccurs,
  randChance,
  randInt,
  randNormal,
  randPick,
  randRange,
} from "./simRandom.ts"
import type {
  DeviceKind,
  SimCell,
  SimCommand,
  SimDevice,
  SimEvent,
  SimEventSeverity,
  SimOutbound,
  SimPallet,
  SimTask,
  SimTruck,
  SimWorker,
  SimWorld,
  TaskKind,
  Vec2,
} from "./simTypes.ts"
import { formatSscc } from "./simWorld.ts"

/** Максимальный шаг интегрирования, сек модельного времени. */
export const MAX_SUBSTEP_SEC = 1
const MAX_EVENTS = 400
const MAX_DONE_TASKS = 60
const MAX_HISTORY = 40
const SENSOR_SAMPLE_SEC = 5
/** Вероятность выброса показаний на одно измерение датчика. */
const SENSOR_SPIKE_CHANCE = 0.001
const REPLENISH_CHECK_SEC = 300
const SHIFT_SEC = 4 * 3600
/** Одновременно выполняемых заданий на один транспорт. */
const TASKS_PER_TRUCK = 2

const MOBILE_KINDS: DeviceKind[] = ["forklift", "agv", "amr"]

const TASK_DEVICE_KINDS: Record<TaskKind, DeviceKind[]> = {
  unload: ["forklift"],
  putaway: ["forklift", "agv"],
  pick: ["amr", "agv"],
  load: ["forklift"],
  replenish: ["agv", "forklift"],
  charge: [],
}

const TASK_PRIORITY: Record<TaskKind, number> = {
  load: 4,
  unload: 3,
  pick: 3,
  putaway: 2,
  replenish: 1,
  charge: 5,
}

const TASK_LABELS: Record<TaskKind, string> = {
  unload: "Разгрузка",
  putaway: "Размещение",
  pick: "Отбор",
  load: "Погрузка",
  replenish: "Пополнение",
  charge: "Заряд",
}

const CARRIERS = [
  "ТК «Север»",
  "Логистик-Плюс",
  "АвтоТранс",
  "СкладСервис",
  "Грузовик77",
]
const CUSTOMERS = [
  "ООО «Магнит-Ритейл»",
  "Сеть «Перекрёсток»",
  "ИП Кузнецов",
  "ООО «ОптТорг»",
  "Маркетплейс «Заря»",
  "Аптека «Здоровье»",
]

interface EventRefs {
  deviceId?: string
  entityId?: string
  zoneId?: string
}

export function taskKindLabel(kind: TaskKind): string {
  return TASK_LABELS[kind]
}

export function isMobileKind(kind: DeviceKind): boolean {
  return MOBILE_KINDS.includes(kind)
}

// ---------------------------------------------------------------------------
// События
// ---------------------------------------------------------------------------

function emit(
  world: SimWorld,
  type: string,
  severity: SimEventSeverity,
  message: string,
  refs: EventRefs = {},
): SimEvent {
  world.counters.event += 1
  const event: SimEvent = {
    id: world.counters.event,
    at: world.timeSec,
    type,
    severity,
    message,
    deviceId: refs.deviceId ?? null,
    entityId: refs.entityId ?? null,
    zoneId: refs.zoneId ?? null,
  }
  world.events.unshift(event)
  if (world.events.length > MAX_EVENTS) world.events.length = MAX_EVENTS
  world.metrics.eventsTotal += 1
  world.eventCountsByType.set(
    type,
    (world.eventCountsByType.get(type) ?? 0) + 1,
  )
  if (refs.deviceId) {
    const device = world.deviceById.get(refs.deviceId)
    if (device) device.lastEventAt = world.timeSec
  }
  return event
}

// ---------------------------------------------------------------------------
// Вспомогательные выборки
// ---------------------------------------------------------------------------

function findTask(world: SimWorld, taskId: string | null): SimTask | null {
  if (!taskId) return null
  return world.tasks.find((task) => task.id === taskId) ?? null
}

function skuCode(world: SimWorld, skuId: string): string {
  return world.skus.find((sku) => sku.id === skuId)?.code ?? skuId
}

/** Свободная ячейка: под размещение приоритетны верхние уровни (резерв). */
function findFreeCell(
  world: SimWorld,
  near: Vec2,
  preferReserve: boolean,
): SimCell | null {
  let best: SimCell | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const cell of world.cells) {
    if (cell.palletId !== null || cell.blocked) continue
    const levelPenalty = preferReserve
      ? cell.level === 1
        ? 60
        : 0
      : cell.level === 1
        ? 0
        : 60
    const score = distance(near, cell.pos) + levelPenalty
    if (score < bestScore) {
      bestScore = score
      best = cell
    }
  }
  return best
}

/** Ячейка с доступной паллетой нужного SKU: сначала зона отбора (уровень 1). */
function findStockCell(
  world: SimWorld,
  skuId: string,
  minLevel = 1,
): SimCell | null {
  let best: SimCell | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const cell of world.cells) {
    if (cell.palletId === null || cell.blocked || cell.level < minLevel)
      continue
    const pallet = world.pallets.get(cell.palletId)
    if (!pallet || pallet.skuId !== skuId || pallet.orderId !== null) continue
    const score = cell.level === 1 ? cell.pos.x : cell.pos.x + 120
    if (score < bestScore) {
      bestScore = score
      best = cell
    }
  }
  return best
}

function dockById(world: SimWorld, dockId: string | null) {
  if (!dockId) return null
  return world.topology.docks.find((dock) => dock.id === dockId) ?? null
}

// ---------------------------------------------------------------------------
// Задания
// ---------------------------------------------------------------------------

interface TaskDraft {
  kind: TaskKind
  from: Vec2
  to: Vec2
  fromLabel: string
  toLabel: string
  palletId?: string | null
  cellId?: string | null
  orderId?: string | null
  truckId?: string | null
  priority?: number
}

function createTask(world: SimWorld, draft: TaskDraft): SimTask {
  world.counters.task += 1
  const task: SimTask = {
    id: `task-${world.counters.task}`,
    kind: draft.kind,
    status: "pending",
    priority: draft.priority ?? TASK_PRIORITY[draft.kind],
    deviceId: null,
    workerId: null,
    from: { ...draft.from },
    to: { ...draft.to },
    fromLabel: draft.fromLabel,
    toLabel: draft.toLabel,
    palletId: draft.palletId ?? null,
    cellId: draft.cellId ?? null,
    orderId: draft.orderId ?? null,
    truckId: draft.truckId ?? null,
    createdAt: world.timeSec,
    assignedAt: null,
    doneAt: null,
  }
  world.tasks.push(task)
  world.metrics.tasksCreated += 1
  emit(
    world,
    "task.created",
    "info",
    `${TASK_LABELS[task.kind]}: задание ${task.id} (${task.fromLabel} → ${task.toLabel})`,
    { entityId: task.id },
  )
  return task
}

function pickWorker(world: SimWorld, kind: TaskKind): SimWorker | null {
  const preferred: Record<string, SimWorker["role"]> = {
    unload: "receiver",
    load: "loader",
    pick: "picker",
  }
  const role = preferred[kind]
  const idle = world.workers.filter((worker) => worker.status === "idle")
  if (idle.length === 0) return null
  return idle.find((worker) => worker.role === role) ?? idle[0]
}

function assignTasks(world: SimWorld): void {
  const pending = world.tasks.filter((task) => task.status === "pending")
  if (pending.length === 0) return
  pending.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)

  for (const task of pending) {
    const kinds = TASK_DEVICE_KINDS[task.kind]
    if (kinds.length === 0) continue
    let chosen: SimDevice | null = null
    let chosenDistance = Number.POSITIVE_INFINITY
    for (const device of world.devices) {
      if (!kinds.includes(device.kind)) continue
      if (!device.online || device.status !== "idle" || device.taskId) continue
      if (device.battery !== null && device.battery < 20) continue
      const d = distance(device.pos, task.from)
      if (d < chosenDistance) {
        chosenDistance = d
        chosen = device
      }
    }
    if (!chosen) continue

    // Погрузчиком управляет человек: без свободного сотрудника задание ждёт.
    let worker: SimWorker | null = null
    if (chosen.kind === "forklift") {
      worker = pickWorker(world, task.kind)
      if (!worker) continue
      worker.status = "busy"
      worker.taskId = task.id
      worker.deviceId = chosen.id
    }

    task.status = "assigned"
    task.deviceId = chosen.id
    task.workerId = worker?.id ?? null
    task.assignedAt = world.timeSec
    chosen.taskId = task.id
    chosen.workerId = worker?.id ?? null
    chosen.phase = "to_source"
    chosen.status = "moving"
    chosen.path = routeBetween(chosen.pos, task.from)
    emit(
      world,
      "task.assigned",
      "info",
      `${TASK_LABELS[task.kind]} ${task.id} → ${chosen.name}${worker ? `, оператор ${worker.name}` : ""}`,
      { deviceId: chosen.id, entityId: task.id },
    )
  }
}

function releaseWorker(world: SimWorld, workerId: string | null): void {
  if (!workerId) return
  const worker = world.workers.find((item) => item.id === workerId)
  if (!worker) return
  worker.taskId = null
  worker.deviceId = null
  if (worker.status === "busy") worker.status = "idle"
}

function finishTask(world: SimWorld, device: SimDevice, task: SimTask): void {
  task.status = "done"
  task.doneAt = world.timeSec
  task.deviceId = device.id
  world.metrics.tasksDone += 1

  const worker = task.workerId
    ? world.workers.find((item) => item.id === task.workerId)
    : null
  if (worker) {
    worker.tasksDone += 1
    worker.taskId = null
    worker.deviceId = null
    if (randChance(world, 0.08)) {
      worker.status = "break"
      worker.breakTimer = randRange(world, 90, 240)
      emit(world, "worker.break", "info", `${worker.name} ушёл на перерыв`, {
        entityId: worker.id,
      })
    } else {
      worker.status = "idle"
    }
  }

  device.taskId = null
  device.workerId = null
  device.phase = null
  device.phaseTimer = 0
  device.path = []
  device.palletId = null
  device.status = "idle"
  device.tasksDone += 1
}

/**
 * Снять задание с устройства (отказ, отключение, разряд).
 * Паллета, если она была на вилах, выгружается на месте.
 */
function abortTask(world: SimWorld, device: SimDevice, reason: string): void {
  const task = findTask(world, device.taskId)
  releaseWorker(world, device.workerId)
  device.workerId = null
  device.taskId = null
  device.phase = null
  device.phaseTimer = 0
  device.path = []

  if (task) {
    if (device.palletId) {
      const pallet = world.pallets.get(device.palletId)
      if (pallet) {
        pallet.locationKind = "zone"
        pallet.locationId = ZONE_STORAGE
        pallet.pos = { ...device.pos }
        task.from = { ...device.pos }
        task.fromLabel = "аварийная выгрузка"
        task.palletId = pallet.id
      }
    }
    if (task.kind === "charge") {
      task.status = "done"
      task.doneAt = world.timeSec
    } else {
      task.status = "pending"
      task.deviceId = null
      task.workerId = null
      task.assignedAt = null
    }
    emit(
      world,
      "task.released",
      "warning",
      `${TASK_LABELS[task.kind]} ${task.id} снято с ${device.name}: ${reason}`,
      { deviceId: device.id, entityId: task.id },
    )
  }
  device.palletId = null
}

// ---------------------------------------------------------------------------
// Сканирование
// ---------------------------------------------------------------------------

function fireScan(
  world: SimWorld,
  scannerId: string,
  label: string,
  entityId: string,
): boolean {
  const scanner = world.deviceById.get(scannerId)
  world.metrics.scans += 1
  if (scanner?.online && scanner.status !== "fault") {
    scanner.status = "scanning"
    scanner.phaseTimer = 1.5
  }
  if (randChance(world, world.config.scanErrorRate)) {
    world.metrics.scanFailures += 1
    emit(world, "scan.failed", "warning", `Ошибка считывания: ${label}`, {
      deviceId: scannerId,
      entityId,
    })
    return false
  }
  emit(world, "scan.ok", "info", `Считано: ${label}`, {
    deviceId: scannerId,
    entityId,
  })
  return true
}

// ---------------------------------------------------------------------------
// Транспорт и ворота
// ---------------------------------------------------------------------------

function plate(world: SimWorld): string {
  const letters = "АВЕКМНОРСТУХ"
  const l1 = letters[randInt(world, 0, letters.length - 1)]
  const l2 = letters[randInt(world, 0, letters.length - 1)]
  const l3 = letters[randInt(world, 0, letters.length - 1)]
  return `${l1}${randInt(world, 100, 999)}${l2}${l3} ${randInt(world, 10, 99)}`
}

export function spawnInboundTruck(world: SimWorld): SimTruck {
  world.counters.truck += 1
  world.counters.inbound += 1
  const sku = randPick(world, world.skus)
  const palletsPlanned = randInt(world, 4, 10)
  const inboundId = `inb-${world.counters.inbound}`
  const truckId = `trk-${world.counters.truck}`

  world.inbound.push({
    id: inboundId,
    code: `IN-${2600 + world.counters.inbound}`,
    skuId: sku.id,
    palletsPlanned,
    palletsReceived: 0,
    palletsPutaway: 0,
    status: "awaiting",
    truckId,
    createdAt: world.timeSec,
  })

  const truck: SimTruck = {
    id: truckId,
    plate: plate(world),
    carrier: randPick(world, CARRIERS),
    direction: "inbound",
    status: "queued",
    dockId: null,
    arrivedAt: world.timeSec,
    dockedAt: null,
    palletsPlanned,
    palletsDone: 0,
    orderIds: [inboundId],
    pos: { x: -14, z: 22 },
    departTimer: 0,
  }
  world.trucks.push(truck)
  world.metrics.trucksArrived += 1
  emit(
    world,
    "truck.arrived",
    "info",
    `Прибыл транспорт ${truck.plate} (${truck.carrier}): ${palletsPlanned} пал. ${sku.code}`,
    { entityId: truck.id, zoneId: ZONE_RECEIVING },
  )
  return truck
}

function spawnOutboundTruck(world: SimWorld, orders: SimOutbound[]): void {
  world.counters.truck += 1
  const palletsPlanned = orders.reduce(
    (sum, order) =>
      sum + order.lines.reduce((acc, line) => acc + line.pallets, 0),
    0,
  )
  const truck: SimTruck = {
    id: `trk-${world.counters.truck}`,
    plate: plate(world),
    carrier: randPick(world, CARRIERS),
    direction: "outbound",
    status: "queued",
    dockId: null,
    arrivedAt: world.timeSec,
    dockedAt: null,
    palletsPlanned,
    palletsDone: 0,
    orderIds: orders.map((order) => order.id),
    pos: { x: 118, z: 44 },
    departTimer: 0,
  }
  world.trucks.push(truck)
  world.metrics.trucksArrived += 1
  for (const order of orders) {
    order.status = "loading"
  }
  emit(
    world,
    "truck.arrived",
    "info",
    `Подан транспорт под отгрузку ${truck.plate}: заказы ${orders
      .map((order) => order.code)
      .join(", ")}`,
    { entityId: truck.id, zoneId: ZONE_SHIPPING },
  )
}

function repositionQueuedTrucks(world: SimWorld): void {
  let inboundIndex = 0
  let outboundIndex = 0
  for (const truck of world.trucks) {
    if (truck.status !== "queued") continue
    if (truck.direction === "inbound") {
      truck.pos = {
        x: -14 - Math.floor(inboundIndex / 3) * 8,
        z: 10 + (inboundIndex % 3) * 12,
      }
      inboundIndex += 1
    } else {
      truck.pos = {
        x: 118 + Math.floor(outboundIndex / 3) * 8,
        z: 34 + (outboundIndex % 3) * 10,
      }
      outboundIndex += 1
    }
  }
}

function processDocks(world: SimWorld, dtSec: number): void {
  const docks = world.topology.docks
  let occupied = 0

  for (const dock of docks) {
    const door = world.deviceById.get(dock.id)
    if (door && door.status === "occupied") occupied += 1
  }
  world.metrics.dockSec += dtSec * docks.length
  world.metrics.dockBusySec += dtSec * occupied

  // Постановка к воротам
  for (const truck of world.trucks) {
    if (truck.status !== "queued") continue
    const dock = docks.find((item) => {
      if (item.direction !== truck.direction) return false
      const door = world.deviceById.get(item.id)
      return door?.online && door.status === "idle"
    })
    if (!dock) continue
    const door = world.deviceById.get(dock.id)
    if (door) door.status = "occupied"
    truck.status = "docked"
    truck.dockId = dock.id
    truck.dockedAt = world.timeSec
    truck.pos = { ...dock.yardPos }
    if (truck.direction === "inbound") {
      const inbound = world.inbound.find(
        (item) => item.id === truck.orderIds[0],
      )
      if (inbound) inbound.status = "unloading"
    }
    emit(
      world,
      "dock.assigned",
      "info",
      `${truck.plate} подан к воротам ${dock.code}`,
      { deviceId: dock.id, entityId: truck.id },
    )
  }

  // Генерация заданий на разгрузку/погрузку
  for (const truck of world.trucks) {
    if (truck.status !== "docked") continue
    const dock = dockById(world, truck.dockId)
    if (!dock) continue
    const active = world.tasks.filter(
      (task) => task.truckId === truck.id && task.status !== "done",
    ).length
    const remaining = truck.palletsPlanned - truck.palletsDone - active
    if (remaining <= 0) continue
    const slots = Math.min(TASKS_PER_TRUCK - active, remaining)
    for (let i = 0; i < slots; i += 1) {
      if (truck.direction === "inbound") {
        createTask(world, {
          kind: "unload",
          from: dock.pos,
          to: RECEIVING_STAGING,
          fromLabel: `ворота ${dock.code}`,
          toLabel: "приёмка",
          truckId: truck.id,
        })
      } else {
        const pallet = findStagedPallet(world, truck)
        if (!pallet) break
        createTask(world, {
          kind: "load",
          from: SHIPPING_STAGING,
          to: dock.pos,
          fromLabel: "буфер отгрузки",
          toLabel: `ворота ${dock.code}`,
          truckId: truck.id,
          palletId: pallet.id,
          orderId: pallet.orderId,
        })
      }
    }
  }

  // Отправление
  for (const truck of world.trucks) {
    if (truck.status !== "docked" || truck.palletsDone < truck.palletsPlanned)
      continue
    truck.departTimer += dtSec
    if (truck.departTimer < 45) continue
    const dock = dockById(world, truck.dockId)
    const door = dock ? world.deviceById.get(dock.id) : null
    if (door) door.status = "idle"
    truck.status = "departed"
    world.metrics.trucksDeparted += 1
    if (truck.direction === "inbound") {
      const inbound = world.inbound.find(
        (item) => item.id === truck.orderIds[0],
      )
      if (inbound) inbound.status = "received"
      emit(
        world,
        "truck.departed",
        "success",
        `Разгрузка завершена, ${truck.plate} покинул склад (${truck.palletsDone} пал.)`,
        { entityId: truck.id, zoneId: ZONE_RECEIVING },
      )
    } else {
      for (const orderId of truck.orderIds) {
        const order = world.outbound.find((item) => item.id === orderId)
        if (!order) continue
        order.status = "shipped"
        order.shippedAt = world.timeSec
        world.metrics.ordersShipped += 1
        world.metrics.orderCycleSumSec += world.timeSec - order.createdAt
        world.metrics.orderCycleCount += 1
        const late = world.timeSec > order.dueAt
        if (late) world.metrics.ordersLate += 1
        emit(
          world,
          late ? "order.shipped_late" : "order.shipped",
          late ? "warning" : "success",
          `Заказ ${order.code} отгружен${late ? " с опозданием" : " в срок"} (${order.customer})`,
          { entityId: order.id, zoneId: ZONE_SHIPPING },
        )
      }
      emit(
        world,
        "shipment.departed",
        "success",
        `Транспорт ${truck.plate} ушёл с ${truck.palletsDone} пал.`,
        { entityId: truck.id, zoneId: ZONE_SHIPPING },
      )
    }
  }

  world.trucks = world.trucks.filter((truck) => truck.status !== "departed")
  repositionQueuedTrucks(world)
}

function findStagedPallet(world: SimWorld, truck: SimTruck): SimPallet | null {
  const reserved = new Set(
    world.tasks
      .filter(
        (task) =>
          task.kind === "load" && task.status !== "done" && task.palletId,
      )
      .map((task) => task.palletId as string),
  )
  for (const pallet of world.pallets.values()) {
    if (pallet.locationKind !== "zone" || pallet.locationId !== ZONE_SHIPPING)
      continue
    if (reserved.has(pallet.id)) continue
    if (pallet.orderId && !truck.orderIds.includes(pallet.orderId)) continue
    return pallet
  }
  return null
}

// ---------------------------------------------------------------------------
// Заказы: генерация, сборка, упаковка, отгрузка
// ---------------------------------------------------------------------------

export function spawnOutboundOrder(
  world: SimWorld,
  forceUrgent = false,
): SimOutbound {
  world.counters.outbound += 1
  const lineCount = randInt(world, 1, 3)
  const lines: SimOutbound["lines"] = []
  for (let i = 0; i < lineCount; i += 1) {
    const sku = randPick(world, world.skus)
    if (lines.some((line) => line.skuId === sku.id)) continue
    lines.push({ skuId: sku.id, pallets: randInt(world, 1, 3), picked: 0 })
  }
  if (lines.length === 0) {
    lines.push({ skuId: world.skus[0].id, pallets: 1, picked: 0 })
  }
  const urgent = forceUrgent || randChance(world, 0.15)
  const order: SimOutbound = {
    id: `out-${world.counters.outbound}`,
    code: `OUT-${4800 + world.counters.outbound}`,
    customer: randPick(world, CUSTOMERS),
    lines,
    status: "new",
    priority: urgent ? "urgent" : "normal",
    createdAt: world.timeSec,
    dueAt:
      world.timeSec +
      (urgent ? randRange(world, 1200, 2400) : randRange(world, 3600, 9000)),
    shippedAt: null,
    packTimer: 0,
    palletIds: [],
  }
  world.outbound.push(order)
  world.metrics.ordersCreated += 1
  emit(
    world,
    "order.created",
    urgent ? "warning" : "info",
    `Новый заказ ${order.code} (${order.customer}), строк: ${lines.length}${urgent ? ", срочный" : ""}`,
    { entityId: order.id },
  )
  return order
}

function processOrderGeneration(world: SimWorld, dtSec: number): void {
  world.accumulators.order += (dtSec * world.config.ordersPerHour) / 3600
  while (world.accumulators.order >= 1) {
    world.accumulators.order -= 1
    spawnOutboundOrder(world)
  }
}

function processOrderAllocation(world: SimWorld): void {
  for (const order of world.outbound) {
    if (order.status !== "new" && order.status !== "backorder") continue
    let created = 0
    let missing = 0
    for (const line of order.lines) {
      const active = world.tasks.filter(
        (task) =>
          task.orderId === order.id &&
          task.kind === "pick" &&
          task.status !== "done" &&
          task.palletId !== null &&
          world.pallets.get(task.palletId)?.skuId === line.skuId,
      ).length
      const need = line.pallets - line.picked - active
      for (let i = 0; i < need; i += 1) {
        const cell = findStockCell(world, line.skuId)
        if (!cell?.palletId) {
          missing += 1
          break
        }
        const pallet = world.pallets.get(cell.palletId)
        if (!pallet) break
        pallet.orderId = order.id
        createTask(world, {
          kind: "pick",
          from: cell.pos,
          to: PACKING_POINT,
          fromLabel: `ячейка ${cell.id}`,
          toLabel: "упаковка",
          palletId: pallet.id,
          cellId: cell.id,
          orderId: order.id,
          priority: order.priority === "urgent" ? 5 : TASK_PRIORITY.pick,
        })
        created += 1
      }
    }
    if (created > 0) {
      order.status = "picking"
    } else if (missing > 0 && order.status !== "backorder") {
      order.status = "backorder"
      emit(
        world,
        "order.backorder",
        "warning",
        `Заказ ${order.code}: недостаточно запаса, ожидает пополнения`,
        { entityId: order.id },
      )
    }
  }
}

function processPacking(world: SimWorld, dtSec: number): void {
  const conveyor = world.deviceById.get("cnv-2")
  const conveyorOk = conveyor?.online && conveyor.status === "running"

  for (const order of world.outbound) {
    if (order.status === "picking") {
      const complete = order.lines.every((line) => line.picked >= line.pallets)
      if (complete) {
        order.status = "packing"
        const total = order.lines.reduce((sum, line) => sum + line.pallets, 0)
        order.packTimer = 40 + total * 25
        emit(
          world,
          "order.picked",
          "info",
          `Заказ ${order.code} собран, передан на упаковку`,
          {
            entityId: order.id,
            zoneId: ZONE_PACKING,
          },
        )
      }
      continue
    }
    if (order.status !== "packing") continue
    if (!conveyorOk) continue
    order.packTimer -= dtSec
    if (order.packTimer > 0) continue
    order.status = "staged"
    for (const palletId of order.palletIds) {
      const pallet = world.pallets.get(palletId)
      if (!pallet) continue
      pallet.locationKind = "zone"
      pallet.locationId = ZONE_SHIPPING
      pallet.pos = { ...SHIPPING_STAGING }
    }
    fireScan(world, "scn-PACK", `упаковка заказа ${order.code}`, order.id)
    emit(
      world,
      "order.packed",
      "success",
      `Заказ ${order.code} упакован и перемещён в буфер отгрузки`,
      { entityId: order.id, zoneId: ZONE_SHIPPING },
    )
  }
}

function processShipping(world: SimWorld): void {
  const staged = world.outbound.filter((order) => order.status === "staged")
  if (staged.length === 0) return
  const waitingTruck = world.trucks.some(
    (truck) => truck.direction === "outbound" && truck.status === "queued",
  )
  if (waitingTruck) return
  const urgent = staged.filter((order) => order.priority === "urgent")
  const batch = (
    urgent.length > 0
      ? [...urgent, ...staged.filter((o) => o.priority !== "urgent")]
      : staged
  ).slice(0, 3)
  if (batch.length === 0) return
  if (batch.length < 2 && urgent.length === 0 && staged.length < 2) {
    // Ждём накопления партии, если нет срочных заказов.
    const oldest = Math.min(...staged.map((order) => order.createdAt))
    if (world.timeSec - oldest < 600) return
  }
  spawnOutboundTruck(world, batch)
}

// ---------------------------------------------------------------------------
// Устройства: движение, фазы заданий, заряд, отказы
// ---------------------------------------------------------------------------

function advanceAlongPath(device: SimDevice, dtSec: number): void {
  let budget = device.speed * dtSec
  while (budget > 0 && device.path.length > 0) {
    const target = device.path[0]
    const remaining = distance(device.pos, target)
    if (remaining <= budget) {
      device.pos = { ...target }
      device.path.shift()
      budget -= remaining
    } else {
      const ratio = budget / remaining
      device.pos = {
        x: device.pos.x + (target.x - device.pos.x) * ratio,
        z: device.pos.z + (target.z - device.pos.z) * ratio,
      }
      budget = 0
    }
  }
}

function handlingTime(
  world: SimWorld,
  kind: TaskKind,
  atSource: boolean,
): number {
  switch (kind) {
    case "unload":
      return randNormal(world, atSource ? 24 : 14, 5, 8, 50)
    case "putaway":
      return randNormal(world, atSource ? 12 : 18, 4, 6, 40)
    case "pick":
      return randNormal(world, atSource ? 20 : 12, 5, 7, 45)
    case "load":
      return randNormal(world, atSource ? 14 : 22, 5, 8, 50)
    case "replenish":
      return randNormal(world, 16, 4, 8, 40)
    case "charge":
      return 4
    default:
      return 12
  }
}

function onArriveSource(
  world: SimWorld,
  device: SimDevice,
  task: SimTask,
): void {
  if (task.kind === "charge") {
    device.status = "charging"
    device.phase = "at_source"
    emit(
      world,
      "device.charging",
      "info",
      `${device.name} встал на зарядную станцию`,
      {
        deviceId: device.id,
      },
    )
    return
  }
  device.phase = "at_source"
  device.status = "loading"
  device.phaseTimer = handlingTime(world, task.kind, true)
}

function pickUpPallet(world: SimWorld, device: SimDevice, task: SimTask): void {
  if (task.kind === "unload") {
    const truck = world.trucks.find((item) => item.id === task.truckId)
    const inbound = truck
      ? world.inbound.find((item) => item.id === truck.orderIds[0])
      : null
    const sku = inbound
      ? world.skus.find((item) => item.id === inbound.skuId)
      : null
    world.counters.pallet += 1
    const pallet: SimPallet = {
      id: `pal-${world.counters.pallet}`,
      sscc: formatSscc(world.counters.pallet),
      skuId: sku?.id ?? world.skus[0].id,
      qty: sku?.unitsPerPallet ?? 500,
      locationKind: "device",
      locationId: device.id,
      pos: { ...device.pos },
      createdAt: world.timeSec,
      orderId: null,
    }
    world.pallets.set(pallet.id, pallet)
    task.palletId = pallet.id
    device.palletId = pallet.id
    const dock = dockById(world, truck?.dockId ?? null)
    if (dock) {
      fireScan(
        world,
        `scn-${dock.code}`,
        `паллета ${pallet.sscc} (${skuCode(world, pallet.skuId)})`,
        pallet.id,
      )
    }
    return
  }

  const pallet = task.palletId ? world.pallets.get(task.palletId) : null
  if (!pallet) return
  if (task.kind === "pick" && task.cellId) {
    const cell = world.cellById.get(task.cellId)
    if (cell && cell.palletId === pallet.id) cell.palletId = null
  }
  pallet.locationKind = "device"
  pallet.locationId = device.id
  device.palletId = pallet.id
}

function dropOffPallet(
  world: SimWorld,
  device: SimDevice,
  task: SimTask,
): void {
  const pallet = task.palletId ? world.pallets.get(task.palletId) : null

  switch (task.kind) {
    case "unload": {
      const truck = world.trucks.find((item) => item.id === task.truckId)
      if (truck) truck.palletsDone += 1
      const inbound = truck
        ? world.inbound.find((item) => item.id === truck.orderIds[0])
        : null
      if (inbound) inbound.palletsReceived += 1
      world.metrics.palletsReceived += 1
      if (pallet) {
        pallet.locationKind = "zone"
        pallet.locationId = ZONE_RECEIVING
        pallet.pos = { ...RECEIVING_STAGING }
        emit(
          world,
          "receipt.completed",
          "info",
          `Принята паллета ${pallet.sscc} (${skuCode(world, pallet.skuId)}) в зону приёмки`,
          { deviceId: device.id, entityId: pallet.id, zoneId: ZONE_RECEIVING },
        )
        const cell = findFreeCell(world, RECEIVING_STAGING, true)
        if (cell) {
          createTask(world, {
            kind: "putaway",
            from: RECEIVING_STAGING,
            to: cell.pos,
            fromLabel: "приёмка",
            toLabel: `ячейка ${cell.id}`,
            palletId: pallet.id,
            cellId: cell.id,
          })
        } else {
          emit(
            world,
            "storage.full",
            "error",
            "Нет свободных ячеек для размещения",
            {
              zoneId: ZONE_STORAGE,
            },
          )
        }
      }
      break
    }
    case "putaway":
    case "replenish": {
      const cell = task.cellId ? world.cellById.get(task.cellId) : null
      if (pallet && cell && cell.palletId === null) {
        cell.palletId = pallet.id
        pallet.locationKind = "cell"
        pallet.locationId = cell.id
        pallet.pos = { ...cell.pos }
        if (task.kind === "putaway") {
          world.metrics.palletsPutaway += 1
          const inbound = world.inbound.find(
            (item) => item.skuId === pallet.skuId && item.status !== "closed",
          )
          if (inbound) inbound.palletsPutaway += 1
          emit(
            world,
            "putaway.completed",
            "success",
            `Паллета ${pallet.sscc} размещена в ячейке ${cell.id}`,
            { deviceId: device.id, entityId: pallet.id, zoneId: ZONE_STORAGE },
          )
        } else {
          emit(
            world,
            "replenishment.completed",
            "success",
            `Пополнение зоны отбора: ${skuCode(world, pallet.skuId)} → ${cell.id}`,
            { deviceId: device.id, entityId: pallet.id, zoneId: ZONE_STORAGE },
          )
        }
      } else if (pallet) {
        pallet.locationKind = "zone"
        pallet.locationId = ZONE_STORAGE
        pallet.pos = { ...device.pos }
        emit(
          world,
          "putaway.failed",
          "warning",
          `Ячейка ${task.cellId ?? "?"} занята, паллета оставлена в проезде`,
          {
            deviceId: device.id,
            entityId: pallet.id,
          },
        )
      }
      break
    }
    case "pick": {
      const order = world.outbound.find((item) => item.id === task.orderId)
      if (pallet) {
        pallet.locationKind = "zone"
        pallet.locationId = ZONE_PACKING
        pallet.pos = { ...PACKING_POINT }
        world.metrics.palletsPicked += 1
        if (order) {
          const line = order.lines.find((item) => item.skuId === pallet.skuId)
          if (line) line.picked += 1
          order.palletIds.push(pallet.id)
          emit(
            world,
            "pick.completed",
            "info",
            `Отобрана паллета ${skuCode(world, pallet.skuId)} для заказа ${order.code}`,
            { deviceId: device.id, entityId: order.id, zoneId: ZONE_PACKING },
          )
        }
      }
      break
    }
    case "load": {
      const truck = world.trucks.find((item) => item.id === task.truckId)
      if (truck) truck.palletsDone += 1
      if (pallet) {
        const dock = dockById(world, truck?.dockId ?? null)
        if (dock) {
          fireScan(
            world,
            `scn-${dock.code}`,
            `отгрузка ${pallet.sscc}`,
            pallet.id,
          )
        }
        world.pallets.delete(pallet.id)
        world.metrics.palletsShipped += 1
        emit(
          world,
          "load.completed",
          "info",
          `Паллета ${pallet.sscc} загружена в ${truck?.plate ?? "транспорт"}`,
          { deviceId: device.id, entityId: pallet.id, zoneId: ZONE_SHIPPING },
        )
      }
      break
    }
    case "charge":
      break
    default:
      break
  }
}

function requestCharge(
  world: SimWorld,
  device: SimDevice,
  urgent: boolean,
): void {
  if (device.taskId) return
  const charger = world.devices.find(
    (item) => item.kind === "charger" && item.status === "idle" && item.online,
  )
  if (!charger) return
  const task = createTask(world, {
    kind: "charge",
    from: charger.pos,
    to: charger.pos,
    fromLabel: charger.name,
    toLabel: charger.name,
    priority: urgent ? 6 : TASK_PRIORITY.charge,
  })
  task.status = "assigned"
  task.deviceId = device.id
  task.assignedAt = world.timeSec
  charger.status = "occupied"
  charger.taskId = task.id
  device.taskId = task.id
  device.phase = "to_source"
  device.status = "moving"
  device.path = routeBetween(device.pos, charger.pos)
  emit(
    world,
    "device.battery_low",
    urgent ? "warning" : "info",
    `${device.name}: заряд ${Math.round(device.battery ?? 0)}%, направлен на ${charger.name}`,
    { deviceId: device.id },
  )
}

function completeCharge(world: SimWorld, device: SimDevice): void {
  const task = findTask(world, device.taskId)
  if (task) {
    task.status = "done"
    task.doneAt = world.timeSec
    const charger = world.devices.find(
      (item) => item.taskId === task.id && item.kind === "charger",
    )
    if (charger) {
      charger.status = "idle"
      charger.taskId = null
    }
  }
  device.taskId = null
  device.phase = null
  device.status = "idle"
  world.metrics.chargeCycles += 1
  emit(
    world,
    "device.charged",
    "success",
    `${device.name} заряжен до ${Math.round(device.battery ?? 0)}%`,
    {
      deviceId: device.id,
    },
  )
}

export function injectFault(
  world: SimWorld,
  device: SimDevice,
  cause: string,
): void {
  if (device.status === "fault" || device.status === "offline") return
  const wasBusy = device.taskId !== null
  if (wasBusy) abortTask(world, device, "отказ устройства")
  device.status = "fault"
  device.faultCount += 1
  device.repairTimer = randRange(world, 60, 260)
  world.metrics.faults += 1
  emit(world, "device.fault", "error", `${device.name}: отказ — ${cause}`, {
    deviceId: device.id,
    zoneId: device.zoneId ?? undefined,
  })
}

function repairDevice(world: SimWorld, device: SimDevice, auto: boolean): void {
  device.status =
    device.kind === "conveyor" || device.kind === "sensor" ? "running" : "idle"
  device.repairTimer = 0
  device.health = Math.max(device.health, 45)
  emit(
    world,
    "device.repaired",
    "success",
    `${device.name} восстановлен${auto ? " (автосброс)" : " вручную"}`,
    { deviceId: device.id },
  )
}

function processDevices(world: SimWorld, dtSec: number): void {
  const drainPerSec = world.config.batteryDrainPerMin / 60

  for (const device of world.devices) {
    if (device.status === "scanning") {
      device.phaseTimer -= dtSec
      if (device.phaseTimer <= 0) device.status = "idle"
      continue
    }

    if (device.status === "fault" || device.status === "maintenance") {
      device.repairTimer -= dtSec
      if (device.repairTimer <= 0) {
        if (device.status === "maintenance") {
          device.health = 100
          device.status = isMobileKind(device.kind) ? "idle" : "running"
          emit(
            world,
            "device.maintenance_done",
            "success",
            `${device.name}: ТО завершено`,
            {
              deviceId: device.id,
            },
          )
        } else if (world.config.autoRepair) {
          repairDevice(world, device, true)
        }
      }
      continue
    }

    if (!isMobileKind(device.kind)) continue

    const task = findTask(world, device.taskId)

    if (device.status === "moving") {
      advanceAlongPath(device, dtSec)
      device.busySec += dtSec
      if (device.battery !== null)
        device.battery = Math.max(0, device.battery - drainPerSec * dtSec)
      device.health = Math.max(0, device.health - dtSec * 0.0009)
      if (device.palletId) {
        const pallet = world.pallets.get(device.palletId)
        if (pallet) pallet.pos = { ...device.pos }
      }
      if (device.path.length === 0 && task) {
        if (device.phase === "to_source") {
          onArriveSource(world, device, task)
        } else if (device.phase === "to_dest") {
          device.phase = "at_dest"
          device.status = "unloading"
          device.phaseTimer = handlingTime(world, task.kind, false)
        }
      } else if (device.path.length === 0 && !task) {
        device.status = "idle"
      }
      continue
    }

    if (device.status === "loading" || device.status === "unloading") {
      device.phaseTimer -= dtSec
      device.busySec += dtSec
      if (device.battery !== null) {
        device.battery = Math.max(0, device.battery - drainPerSec * 0.6 * dtSec)
      }
      if (device.phaseTimer > 0 || !task) continue
      if (device.phase === "at_source") {
        pickUpPallet(world, device, task)
        device.phase = "to_dest"
        device.status = "moving"
        device.path = routeBetween(device.pos, task.to)
      } else {
        dropOffPallet(world, device, task)
        finishTask(world, device, task)
      }
      continue
    }

    if (device.status === "charging") {
      if (device.battery !== null) {
        device.battery = Math.min(100, device.battery + dtSec * 0.28)
        if (device.battery >= 96) completeCharge(world, device)
      } else {
        completeCharge(world, device)
      }
      continue
    }

    if (device.status === "idle" && device.online) {
      if (device.battery !== null && device.battery < 25) {
        requestCharge(world, device, device.battery < 12)
        continue
      }
      if (device.health < 12) {
        device.status = "maintenance"
        device.repairTimer = randRange(world, 180, 420)
        emit(
          world,
          "device.maintenance",
          "warning",
          `${device.name} выведен на ТО (ресурс исчерпан)`,
          {
            deviceId: device.id,
          },
        )
      }
    }

    if (device.battery !== null && device.battery <= 1) {
      injectFault(world, device, "полный разряд батареи")
    }
  }
}

function processFaults(world: SimWorld, dtSec: number): void {
  for (const device of world.devices) {
    if (!device.online) continue
    if (
      device.status === "fault" ||
      device.status === "maintenance" ||
      device.status === "offline"
    ) {
      continue
    }
    const eligible =
      isMobileKind(device.kind) ||
      device.kind === "scanner" ||
      device.kind === "printer" ||
      device.kind === "terminal"
    if (!eligible) continue
    const rate = isMobileKind(device.kind)
      ? world.config.faultRatePerHour
      : world.config.faultRatePerHour * 0.4
    if (!eventOccurs(world, rate, dtSec)) continue
    const causes = isMobileKind(device.kind)
      ? [
          "перегрев привода",
          "ошибка датчика вил",
          "потеря связи с контроллером",
          "сбой навигации",
        ]
      : ["ошибка прошивки", "потеря сети", "аппаратный сбой"]
    injectFault(world, device, randPick(world, causes))
  }
}

function processConveyors(world: SimWorld, dtSec: number): void {
  const packingCount = world.outbound.filter(
    (order) => order.status === "packing",
  ).length
  for (const device of world.devices) {
    if (device.kind !== "conveyor") continue
    if (device.status === "jam") {
      device.repairTimer -= dtSec
      device.metric = 0
      if (device.repairTimer <= 0 && world.config.autoRepair) {
        device.status = "running"
        emit(
          world,
          "conveyor.cleared",
          "success",
          `${device.name}: замятие устранено`,
          {
            deviceId: device.id,
          },
        )
      }
      continue
    }
    if (device.status !== "running" || !device.online) {
      device.metric = 0
      continue
    }
    const load =
      device.id === "cnv-2"
        ? packingCount * 9
        : world.trucks.filter((t) => t.status === "docked").length * 7
    device.metric = Math.round(randNormal(world, load, 2, 0, 60))
    if (
      device.history.length === 0 ||
      world.timeSec - device.lastEventAt > 20
    ) {
      device.history.push(device.metric)
      if (device.history.length > MAX_HISTORY) device.history.shift()
      device.lastEventAt = world.timeSec
    }
    if (eventOccurs(world, world.config.jamRatePerHour, dtSec)) {
      device.status = "jam"
      device.repairTimer = randRange(world, 45, 180)
      world.metrics.jams += 1
      emit(
        world,
        "conveyor.jam",
        "error",
        `${device.name}: замятие, линия остановлена`,
        {
          deviceId: device.id,
          zoneId: device.zoneId ?? undefined,
        },
      )
    }
  }
}

/**
 * Показание датчика: колебания вокруг уставки (возврат к среднему), а не
 * свободный дрейф — иначе значение уходит за границы и авария «залипает».
 * Аварии возникают из редких выбросов, как на реальном оборудовании.
 */
function sensorNoise(world: SimWorld, device: SimDevice): number {
  if (device.metricKind === "weight") {
    return Math.max(0, randNormal(world, 480, 220, 0, 1600))
  }
  if (device.metricKind === "photo_eye") {
    return randChance(world, 0.35) ? 1 : 0
  }
  const current = device.metric ?? 0
  const min = device.metricMin ?? 0
  const max = device.metricMax ?? 1
  const span = Math.max(1e-6, max - min)
  const setpoint = (min + max) / 2
  const pull = (setpoint - current) * 0.12
  const noise = randNormal(world, 0, span * 0.02, -span * 0.08, span * 0.08)
  const spike = randChance(world, SENSOR_SPIKE_CHANCE)
    ? randRange(world, -span * 0.95, span * 0.95)
    : 0
  const next = current + pull + noise + spike
  return device.metricKind === "vibration" || device.metricKind === "co2"
    ? Math.max(0, next)
    : next
}

function processSensors(world: SimWorld, dtSec: number): void {
  world.accumulators.sensorSample += dtSec
  if (world.accumulators.sensorSample < SENSOR_SAMPLE_SEC) return
  world.accumulators.sensorSample = 0

  for (const device of world.devices) {
    if (device.kind !== "sensor" || !device.online) continue
    if (device.status === "fault") continue
    const value = sensorNoise(world, device)
    device.metric = Math.round(value * 100) / 100
    device.history.push(device.metric)
    if (device.history.length > MAX_HISTORY) device.history.shift()

    const below = device.metricMin !== null && device.metric < device.metricMin
    const above = device.metricMax !== null && device.metric > device.metricMax
    const breach = below || above
    if (breach && !device.alarm) {
      device.alarm = true
      world.metrics.alarms += 1
      emit(
        world,
        "sensor.alarm",
        device.metricKind === "temperature" ? "error" : "warning",
        `${device.name}: выход за границы — ${device.metric}${device.metricUnit ?? ""}`,
        { deviceId: device.id, zoneId: device.zoneId ?? undefined },
      )
    } else if (!breach && device.alarm) {
      device.alarm = false
      emit(
        world,
        "sensor.normal",
        "success",
        `${device.name}: показания в норме`,
        {
          deviceId: device.id,
        },
      )
    }
  }

  // Периодическая телеметрия в поток событий — чтобы журнал «дышал».
  if (randChance(world, 0.25)) {
    const sensors = world.devices.filter((device) => device.kind === "sensor")
    if (sensors.length > 0) {
      const sensor = randPick(world, sensors)
      emit(
        world,
        "sensor.reading",
        "info",
        `${sensor.name}: ${sensor.metric}${sensor.metricUnit ?? ""}`,
        { deviceId: sensor.id },
      )
    }
  }
}

function processReplenishment(world: SimWorld, dtSec: number): void {
  world.accumulators.replenish += dtSec
  if (world.accumulators.replenish < REPLENISH_CHECK_SEC) return
  world.accumulators.replenish = 0

  for (const sku of world.skus) {
    let pickFace = 0
    for (const cell of world.cells) {
      if (cell.level !== 1 || cell.palletId === null) continue
      if (world.pallets.get(cell.palletId)?.skuId === sku.id) pickFace += 1
    }
    if (pickFace >= 2) continue
    const source = findStockCell(world, sku.id, 2)
    if (!source?.palletId) continue
    const target = findFreeCell(world, source.pos, false)
    if (target?.level !== 1) continue
    const pallet = world.pallets.get(source.palletId)
    if (!pallet) continue
    pallet.orderId = null
    createTask(world, {
      kind: "replenish",
      from: source.pos,
      to: target.pos,
      fromLabel: `ячейка ${source.id}`,
      toLabel: `ячейка ${target.id}`,
      palletId: pallet.id,
      cellId: target.id,
    })
    source.palletId = null
    pallet.locationKind = "zone"
    pallet.locationId = ZONE_STORAGE
  }
}

function processWorkers(world: SimWorld, dtSec: number): void {
  for (const worker of world.workers) {
    if (worker.status !== "break") continue
    worker.breakTimer -= dtSec
    if (worker.breakTimer <= 0) {
      worker.status = "idle"
      emit(world, "worker.back", "info", `${worker.name} вернулся к работе`, {
        entityId: worker.id,
      })
    }
  }

  world.accumulators.shift += dtSec
  if (world.accumulators.shift >= SHIFT_SEC) {
    world.accumulators.shift = 0
    emit(
      world,
      "shift.changed",
      "info",
      "Пересменка: состав смены обновлён",
      {},
    )
    for (const worker of world.workers) {
      if (worker.status === "break") {
        worker.status = "idle"
        worker.breakTimer = 0
      }
    }
  }
}

function processTruckArrivals(world: SimWorld, dtSec: number): void {
  world.accumulators.truckArrival +=
    (dtSec * world.config.truckArrivalsPerHour) / 3600
  while (world.accumulators.truckArrival >= 1) {
    world.accumulators.truckArrival -= 1
    spawnInboundTruck(world)
  }
}

/** Чистка истории: журнал заданий и закрытые документы не растут бесконечно. */
function trimHistory(world: SimWorld): void {
  const done = world.tasks.filter((task) => task.status === "done")
  if (done.length > MAX_DONE_TASKS) {
    const cutoff = done[done.length - MAX_DONE_TASKS].doneAt ?? 0
    world.tasks = world.tasks.filter(
      (task) => task.status !== "done" || (task.doneAt ?? 0) >= cutoff,
    )
  }
  if (world.outbound.length > 120) {
    world.outbound = world.outbound.filter(
      (order) =>
        order.status !== "shipped" ||
        world.timeSec - (order.shippedAt ?? 0) < 3600,
    )
  }
  if (world.inbound.length > 80) {
    for (const inbound of world.inbound) {
      if (
        inbound.status === "received" &&
        inbound.palletsPutaway >= inbound.palletsReceived
      ) {
        inbound.status = "closed"
      }
    }
    world.inbound = world.inbound
      .filter((inbound) => inbound.status !== "closed")
      .slice(-80)
  }
}

/** Один шаг модели. `dtSec` не должен превышать `MAX_SUBSTEP_SEC`. */
export function stepWorld(world: SimWorld, dtSec: number): void {
  world.timeSec += dtSec
  processTruckArrivals(world, dtSec)
  processDocks(world, dtSec)
  processOrderGeneration(world, dtSec)
  processOrderAllocation(world)
  processPacking(world, dtSec)
  processShipping(world)
  processReplenishment(world, dtSec)
  assignTasks(world)
  processDevices(world, dtSec)
  processFaults(world, dtSec)
  processConveyors(world, dtSec)
  processSensors(world, dtSec)
  processWorkers(world, dtSec)
  trimHistory(world)
}

/** Прогон модели на произвольный интервал с безопасным шагом интегрирования. */
export function advanceWorld(world: SimWorld, seconds: number): void {
  let left = seconds
  while (left > 0) {
    const step = Math.min(MAX_SUBSTEP_SEC, left)
    stepWorld(world, step)
    left -= step
  }
}

// ---------------------------------------------------------------------------
// Команды пользователя
// ---------------------------------------------------------------------------

export function applyCommand(world: SimWorld, command: SimCommand): void {
  switch (command.type) {
    case "spawnInboundTruck":
      spawnInboundTruck(world)
      break
    case "spawnOutboundOrder":
      spawnOutboundOrder(world, command.urgent === true)
      break
    case "injectFault": {
      const device = world.deviceById.get(command.deviceId)
      if (device) injectFault(world, device, "ручная инъекция отказа")
      break
    }
    case "repairDevice": {
      const device = world.deviceById.get(command.deviceId)
      if (!device) break
      if (device.status === "jam") {
        device.status = "running"
        device.repairTimer = 0
        emit(
          world,
          "conveyor.cleared",
          "success",
          `${device.name}: замятие устранено оператором`,
          {
            deviceId: device.id,
          },
        )
      } else if (device.status === "fault" || device.status === "maintenance") {
        repairDevice(world, device, false)
      }
      break
    }
    case "toggleDeviceOnline": {
      const device = world.deviceById.get(command.deviceId)
      if (!device) break
      if (device.online) {
        if (device.taskId) abortTask(world, device, "устройство отключено")
        device.online = false
        device.status = "offline"
        emit(
          world,
          "device.offline",
          "warning",
          `${device.name} отключён оператором`,
          {
            deviceId: device.id,
          },
        )
      } else {
        device.online = true
        device.status = isMobileKind(device.kind) ? "idle" : "running"
        emit(
          world,
          "device.online",
          "success",
          `${device.name} включён оператором`,
          {
            deviceId: device.id,
          },
        )
      }
      break
    }
    case "recallToCharge": {
      const device = world.deviceById.get(command.deviceId)
      if (!device || device.battery === null) break
      if (device.taskId) abortTask(world, device, "отозван на зарядку")
      device.status = "idle"
      requestCharge(world, device, true)
      break
    }
    case "clearAllAlarms": {
      let cleared = 0
      for (const device of world.devices) {
        if (device.alarm) {
          device.alarm = false
          cleared += 1
        }
        if (device.status === "jam") {
          device.status = "running"
          device.repairTimer = 0
          cleared += 1
        }
      }
      emit(world, "alarms.cleared", "info", `Сброшено аварий: ${cleared}`, {})
      break
    }
    case "emergencyStop": {
      for (const device of world.devices) {
        if (isMobileKind(device.kind)) {
          if (device.taskId) abortTask(world, device, "аварийный останов")
          device.online = false
          device.status = "offline"
        } else if (device.kind === "conveyor") {
          device.status = "idle"
        }
      }
      emit(
        world,
        "system.emergency_stop",
        "error",
        "Аварийный останов: техника и конвейеры остановлены",
        {},
      )
      break
    }
    case "resumeAll": {
      for (const device of world.devices) {
        if (isMobileKind(device.kind)) {
          device.online = true
          if (device.status === "offline") device.status = "idle"
        } else if (device.kind === "conveyor" && device.status === "idle") {
          device.status = "running"
        }
      }
      emit(world, "system.resumed", "success", "Работа возобновлена", {})
      break
    }
    default:
      break
  }
}

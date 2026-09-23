/**
 * Домен симулятора «Сервер устройств и генератор событий».
 *
 * Единицы измерения: координаты — метры в плане склада, время — секунды
 * модельного времени (`timeSec`), заряд и здоровье — проценты.
 */

export interface Vec2 {
  x: number
  z: number
}

export type ZoneKind =
  | "receiving"
  | "storage"
  | "picking"
  | "packing"
  | "shipping"
  | "charging"
  | "yard"

export interface SimZone {
  id: string
  code: string
  name: string
  kind: ZoneKind
  x: number
  z: number
  w: number
  d: number
}

export interface SimRack {
  id: string
  code: string
  zoneId: string
  aisleId?: string
  blockId?: string
  side?: "A" | "B"
  backToBackWith?: string
  x: number
  z: number
  w: number
  d: number
  bays: number
  levels: number
}

export interface SimCell {
  id: string
  rackId: string
  bay: number
  level: number
  pos: Vec2
  palletId: string | null
  blocked: boolean
}

export type DockDirection = "inbound" | "outbound"

export interface SimDock {
  id: string
  code: string
  direction: DockDirection
  pos: Vec2
  /** Точка, где встаёт транспорт (за пределами контура склада). */
  yardPos: Vec2
}

export type DeviceKind =
  | "forklift"
  | "agv"
  | "amr"
  | "conveyor"
  | "scanner"
  | "sensor"
  | "terminal"
  | "dock_door"
  | "charger"
  | "printer"

export type DeviceStatus =
  | "idle"
  | "moving"
  | "waiting"
  | "loading"
  | "unloading"
  | "charging"
  | "running"
  | "scanning"
  | "occupied"
  | "jam"
  | "fault"
  | "maintenance"
  | "offline"

/** Фаза выполнения задания мобильным устройством. */
export type DevicePhase = "to_source" | "at_source" | "to_dest" | "at_dest"

export type SensorMetric =
  | "temperature"
  | "humidity"
  | "vibration"
  | "weight"
  | "co2"
  | "photo_eye"

export interface SimCameraDetection {
  id: string
  camera_id: string
  equipment_id: string
  timestamp: string
  class_name: string
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
  track_id: string | null
  severity: string
}

export interface SimCameraState {
  installed: boolean
  equipment_id?: string
  camera_id?: string
  enabled?: boolean
  online?: boolean
  source?: string
  model?: string
  fps?: number
  inference_ms?: number
  frame_index?: number
  detection_count?: number
  detections?: SimCameraDetection[]
  obstacle?: boolean
  description?: string
  status?: string
  confidence_threshold?: number
  mode?: string
  log?: Array<Pick<SimCameraDetection, "timestamp" | "class_name" | "confidence" | "track_id">>
}

export interface SimDevice {
  id: string
  kind: DeviceKind
  name: string
  status: DeviceStatus
  pos: Vec2
  homePos: Vec2
  zoneId: string | null
  /** Для мобильной техники — м/с, для стационарных устройств 0. */
  speed: number
  /** Заряд в процентах; null — устройство без батареи. */
  battery: number | null
  /** Остаточный ресурс до ТО, проценты. */
  health: number
  online: boolean
  alarm: boolean
  taskId: string | null
  palletId: string | null
  workerId: string | null
  phase: DevicePhase | null
  phaseTimer: number
  path: Vec2[]
  /** Текущее измерение (датчик/конвейер/сканер), null — нет телеметрии. */
  metric: number | null
  metricKind: SensorMetric | null
  metricUnit: string | null
  metricMin: number | null
  metricMax: number | null
  history: number[]
  busySec: number
  faultCount: number
  tasksDone: number
  /** Таймер восстановления после отказа/замятия. */
  repairTimer: number
  lastEventAt: number
  cameraHold?: boolean
  camera?: SimCameraState | null
}

export interface SimSku {
  id: string
  code: string
  name: string
  cold: boolean
  unitsPerPallet: number
}

export type PalletLocationKind = "zone" | "cell" | "device" | "truck"

export interface SimPallet {
  id: string
  sscc: string
  skuId: string
  qty: number
  locationKind: PalletLocationKind
  locationId: string
  pos: Vec2
  createdAt: number
  /** Заказ, под который паллета зарезервирована. */
  orderId: string | null
}

export type TruckStatus =
  | "queued"
  | "docked"
  | "unloading"
  | "loading"
  | "departed"

export interface SimTruck {
  id: string
  plate: string
  carrier: string
  direction: DockDirection
  status: TruckStatus
  dockId: string | null
  arrivedAt: number
  dockedAt: number | null
  palletsPlanned: number
  palletsDone: number
  orderIds: string[]
  pos: Vec2
  departTimer: number
}

export type InboundStatus = "awaiting" | "unloading" | "received" | "closed"

export interface SimInbound {
  id: string
  code: string
  skuId: string
  palletsPlanned: number
  palletsReceived: number
  palletsPutaway: number
  status: InboundStatus
  truckId: string | null
  createdAt: number
}

export type OutboundStatus =
  | "new"
  | "backorder"
  | "picking"
  | "packing"
  | "staged"
  | "loading"
  | "shipped"

export interface SimOutboundLine {
  skuId: string
  pallets: number
  picked: number
}

export interface SimOutbound {
  id: string
  code: string
  customer: string
  lines: SimOutboundLine[]
  status: OutboundStatus
  priority: "normal" | "urgent"
  createdAt: number
  dueAt: number
  shippedAt: number | null
  packTimer: number
  palletIds: string[]
}

export type TaskKind =
  | "unload"
  | "putaway"
  | "pick"
  | "load"
  | "replenish"
  | "charge"

export type TaskStatus = "pending" | "assigned" | "in_progress" | "done"

export interface SimTask {
  id: string
  kind: TaskKind
  status: TaskStatus
  priority: number
  deviceId: string | null
  workerId: string | null
  from: Vec2
  to: Vec2
  fromLabel: string
  toLabel: string
  palletId: string | null
  cellId: string | null
  orderId: string | null
  truckId: string | null
  createdAt: number
  assignedAt: number | null
  doneAt: number | null
}

export type WorkerRole =
  | "receiver"
  | "picker"
  | "loader"
  | "operator"
  | "supervisor"

export type WorkerStatus = "idle" | "busy" | "break" | "off_shift" | "walking"

export interface SimWorker {
  id: string
  name: string
  role: WorkerRole
  status: WorkerStatus
  deviceId: string | null
  taskId: string | null
  tasksDone: number
  breakTimer: number
  code?: string | null
  pos?: { x: number; z: number }
  heading?: number
  speed?: number
  target?: string | null
  current_zone?: string | null
  employeeCode?: string | null
  workerId?: string | null
  displayName?: string | null
  positionTitle?: string | null
  shift?: string | null
  spawned?: boolean
}

export type SimEventSeverity = "info" | "success" | "warning" | "error"

export interface SimEvent {
  id: number
  at: number
  type: string
  severity: SimEventSeverity
  message: string
  deviceId: string | null
  entityId: string | null
  zoneId: string | null
  taskId?: string | null
  orderId?: string | null
  wmsOrderId?: string | null
}

export interface SimMetrics {
  trucksArrived: number
  trucksDeparted: number
  palletsReceived: number
  palletsPutaway: number
  palletsPicked: number
  palletsShipped: number
  ordersCreated: number
  ordersShipped: number
  ordersLate: number
  scans: number
  scanFailures: number
  faults: number
  jams: number
  alarms: number
  chargeCycles: number
  tasksCreated: number
  tasksDone: number
  eventsTotal: number
  /** Сумма и количество для среднего цикла заказа. */
  orderCycleSumSec: number
  orderCycleCount: number
  dockBusySec: number
  dockSec: number
}

export interface SimConfig {
  seed: number
  forklifts: number
  agvs: number
  amrs: number
  workers: number
  truckArrivalsPerHour: number
  ordersPerHour: number
  /** Вероятность отказа устройства в час. */
  faultRatePerHour: number
  /** Доля неудачных считываний сканера. */
  scanErrorRate: number
  /** Вероятность замятия конвейера в час. */
  jamRatePerHour: number
  /** Расход заряда в минуту работы, проценты. */
  batteryDrainPerMin: number
  /** Доля ячеек, занятых на старте. */
  initialFillRatio: number
  /** Автоматически восстанавливать устройства после отказа. */
  autoRepair: boolean
}

export interface SimTopology {
  width: number
  depth: number
  zones: SimZone[]
  racks: SimRack[]
  docks: SimDock[]
  /** Сдвоенные back-to-back блоки (по два стеллажа). */
  blocks?: Array<{
    id: string
    rackAId: string
    rackBId: string
    x: number
    z: number
    w: number
    d: number
  }>
  /** Центральные линии поперечных проездов (координата z). */
  aisleZ: number[]
  /** Центральные линии продольных проездов (координата x). */
  corridorX: number[]
}

export interface SimWorld {
  config: SimConfig
  topology: SimTopology
  timeSec: number
  /** Момент старта модельных суток, секунды от полуночи. */
  dayStartSec: number
  skus: SimSku[]
  cells: SimCell[]
  cellById: Map<string, SimCell>
  devices: SimDevice[]
  deviceById: Map<string, SimDevice>
  pallets: Map<string, SimPallet>
  trucks: SimTruck[]
  inbound: SimInbound[]
  outbound: SimOutbound[]
  tasks: SimTask[]
  workers: SimWorker[]
  /** Новые события в начале массива. */
  events: SimEvent[]
  eventCountsByType: Map<string, number>
  metrics: SimMetrics
  /** Накопители пуассоновских генераторов и периодических процессов. */
  accumulators: {
    truckArrival: number
    order: number
    sensorSample: number
    replenish: number
    shift: number
  }
  counters: {
    event: number
    truck: number
    inbound: number
    outbound: number
    pallet: number
    task: number
  }
  rngState: number
}

/** Команды пользователя, меняющие состояние симуляции на ходу. */
export type SimCommand =
  | { type: "spawnInboundTruck" }
  | { type: "spawnOutboundOrder"; urgent?: boolean }
  | { type: "injectFault"; deviceId: string }
  | { type: "repairDevice"; deviceId: string }
  | { type: "toggleDeviceOnline"; deviceId: string }
  | { type: "recallToCharge"; deviceId: string }
  | { type: "clearAllAlarms" }
  | { type: "emergencyStop" }
  | { type: "resumeAll" }

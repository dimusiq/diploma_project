/**
 * Сервер устройств: непрерывный цикл симуляции и публикация снимков состояния.
 *
 * Модель живёт вне React (модульный синглтон), поэтому продолжает работать при
 * переходах между вкладками и останавливается только по команде пользователя.
 * Снимки публикуются с двумя частотами: движение техники — 20 Гц (плавная
 * анимация на плане), таблицы и журнал — 4 Гц (чтобы не перегружать рендер).
 */

import { advanceWorld, applyCommand, isMobileKind } from "./simEngine.ts"
import { ZONE_PACKING, ZONE_RECEIVING, ZONE_SHIPPING } from "./simLayout.ts"
import type {
  DeviceKind,
  DeviceStatus,
  SimCommand,
  SimConfig,
  SimDevice,
  SimEvent,
  SimInbound,
  SimMetrics,
  SimOutbound,
  SimTask,
  SimTopology,
  SimTruck,
  SimWorker,
  SimWorld,
} from "./simTypes.ts"
import { createWorld, DEFAULT_CONFIG } from "./simWorld.ts"

const TICK_MS = 50
const DATA_PUBLISH_SEC = 0.25
/** Ограничение на «догон» после сворачивания вкладки, сек реального времени. */
const MAX_WALL_STEP_SEC = 0.25

export const SPEED_OPTIONS = [1, 2, 5, 10, 30, 60] as const
export type SimSpeed = (typeof SPEED_OPTIONS)[number]

export interface DeviceMotion {
  id: string
  kind: DeviceKind
  name: string
  status: DeviceStatus
  x: number
  z: number
  battery: number | null
  alarm: boolean
  online: boolean
  carrying: boolean
}

export interface TruckMotion {
  id: string
  plate: string
  direction: "inbound" | "outbound"
  x: number
  z: number
  docked: boolean
}

export interface RackFill {
  rackId: string
  occupied: number
  total: number
}

export interface MotionSnapshot {
  version: number
  timeSec: number
  running: boolean
  devices: DeviceMotion[]
  trucks: TruckMotion[]
  rackFill: RackFill[]
  zonePallets: Record<string, number>
}

export interface DataSnapshot {
  version: number
  timeSec: number
  running: boolean
  speed: SimSpeed
  config: SimConfig
  devices: SimDevice[]
  trucks: SimTruck[]
  inbound: SimInbound[]
  outbound: SimOutbound[]
  tasks: SimTask[]
  workers: SimWorker[]
  events: SimEvent[]
  metrics: SimMetrics
  cellsTotal: number
  cellsOccupied: number
  palletsTotal: number
  eventCounts: Array<{ type: string; count: number }>
  skuLabels: Record<string, string>
}

function cloneDevice(device: SimDevice): SimDevice {
  return {
    ...device,
    pos: { ...device.pos },
    homePos: { ...device.homePos },
    path: [],
    history: [...device.history],
  }
}

function buildMotion(
  world: SimWorld,
  running: boolean,
  version: number,
): MotionSnapshot {
  const rackFill: RackFill[] = world.topology.racks.map((rack) => ({
    rackId: rack.id,
    occupied: 0,
    total: rack.bays * rack.levels,
  }))
  const rackIndex = new Map(rackFill.map((item, index) => [item.rackId, index]))
  for (const cell of world.cells) {
    if (cell.palletId === null) continue
    const index = rackIndex.get(cell.rackId)
    if (index !== undefined) rackFill[index].occupied += 1
  }

  const zonePallets: Record<string, number> = {
    [ZONE_RECEIVING]: 0,
    [ZONE_PACKING]: 0,
    [ZONE_SHIPPING]: 0,
  }
  for (const pallet of world.pallets.values()) {
    if (pallet.locationKind !== "zone") continue
    if (pallet.locationId in zonePallets) zonePallets[pallet.locationId] += 1
  }

  return {
    version,
    timeSec: world.timeSec,
    running,
    devices: world.devices.map((device) => ({
      id: device.id,
      kind: device.kind,
      name: device.name,
      status: device.status,
      x: device.pos.x,
      z: device.pos.z,
      battery: device.battery,
      alarm: device.alarm,
      online: device.online,
      carrying: device.palletId !== null,
    })),
    trucks: world.trucks.map((truck) => ({
      id: truck.id,
      plate: truck.plate,
      direction: truck.direction,
      x: truck.pos.x,
      z: truck.pos.z,
      docked: truck.status === "docked",
    })),
    rackFill,
    zonePallets,
  }
}

function buildData(
  world: SimWorld,
  running: boolean,
  speed: SimSpeed,
  version: number,
): DataSnapshot {
  let cellsOccupied = 0
  for (const cell of world.cells) {
    if (cell.palletId !== null) cellsOccupied += 1
  }
  const eventCounts = [...world.eventCountsByType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 14)

  return {
    version,
    timeSec: world.timeSec,
    running,
    speed,
    config: { ...world.config },
    devices: world.devices.map(cloneDevice),
    trucks: world.trucks.map((truck) => ({ ...truck, pos: { ...truck.pos } })),
    inbound: world.inbound.slice(-40).map((item) => ({ ...item })),
    outbound: world.outbound.slice(-60).map((order) => ({
      ...order,
      lines: order.lines.map((line) => ({ ...line })),
      palletIds: [...order.palletIds],
    })),
    tasks: world.tasks.map((task) => ({
      ...task,
      from: { ...task.from },
      to: { ...task.to },
    })),
    workers: world.workers.map((worker) => ({ ...worker })),
    events: world.events.slice(0, 200),
    metrics: { ...world.metrics },
    cellsTotal: world.cells.length,
    cellsOccupied,
    palletsTotal: world.pallets.size,
    eventCounts,
    skuLabels: Object.fromEntries(world.skus.map((sku) => [sku.id, sku.code])),
  }
}

class DeviceSimulationStore {
  private world: SimWorld
  private running = false
  private everStarted = false
  private speed: SimSpeed = 5
  private timer: ReturnType<typeof setInterval> | null = null
  private lastWallMs = 0
  private dataAccumSec = 0
  private version = 0

  private motionSnapshot: MotionSnapshot
  private dataSnapshot: DataSnapshot
  private motionListeners = new Set<() => void>()
  private dataListeners = new Set<() => void>()

  constructor() {
    this.world = createWorld()
    this.motionSnapshot = buildMotion(this.world, false, 0)
    this.dataSnapshot = buildData(this.world, false, this.speed, 0)
  }

  get topology(): SimTopology {
    return this.world.topology
  }

  get dayStartSec(): number {
    return this.world.dayStartSec
  }

  getMotionSnapshot = (): MotionSnapshot => this.motionSnapshot

  getDataSnapshot = (): DataSnapshot => this.dataSnapshot

  subscribeMotion = (listener: () => void): (() => void) => {
    this.motionListeners.add(listener)
    return () => this.motionListeners.delete(listener)
  }

  subscribeData = (listener: () => void): (() => void) => {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }

  /** Автозапуск при первом открытии вкладки; повторный вход не перезапускает. */
  autoStart(): void {
    if (this.everStarted) return
    this.everStarted = true
    this.start()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastWallMs =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    this.timer = setInterval(this.tick, TICK_MS)
    this.publishAll()
  }

  pause(): void {
    if (!this.running) return
    this.running = false
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.publishAll()
  }

  toggle(): void {
    if (this.running) this.pause()
    else this.start()
  }

  /** Полный сброс модели: новый парк устройств и пустая история. */
  reset(config: Partial<SimConfig> = {}): void {
    const wasRunning = this.running
    this.pause()
    this.world = createWorld({ ...this.world.config, ...config })
    this.dataAccumSec = 0
    this.publishAll()
    if (wasRunning) this.start()
  }

  setSpeed(speed: SimSpeed): void {
    this.speed = speed
    this.publishAll()
  }

  /** Изменение параметров генератора на ходу, без пересборки парка. */
  setConfig(patch: Partial<SimConfig>): void {
    Object.assign(this.world.config, patch)
    this.publishAll()
  }

  command(command: SimCommand): void {
    applyCommand(this.world, command)
    this.publishAll()
  }

  /** Прокрутить модель вперёд без ожидания реального времени. */
  fastForward(seconds: number): void {
    advanceWorld(this.world, seconds)
    this.publishAll()
  }

  /** Сводка по устройствам для заголовка вкладки. */
  countFaults(): number {
    return this.world.devices.filter(
      (device) =>
        device.status === "fault" || device.status === "jam" || device.alarm,
    ).length
  }

  private tick = (): void => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    const wallDt = Math.min(MAX_WALL_STEP_SEC, (now - this.lastWallMs) / 1000)
    this.lastWallMs = now
    if (wallDt <= 0) return

    advanceWorld(this.world, wallDt * this.speed)
    this.publishMotion()

    this.dataAccumSec += wallDt
    if (this.dataAccumSec >= DATA_PUBLISH_SEC) {
      this.dataAccumSec = 0
      this.publishData()
    }
  }

  private publishMotion(): void {
    this.version += 1
    this.motionSnapshot = buildMotion(this.world, this.running, this.version)
    for (const listener of this.motionListeners) listener()
  }

  private publishData(): void {
    this.version += 1
    this.dataSnapshot = buildData(
      this.world,
      this.running,
      this.speed,
      this.version,
    )
    for (const listener of this.dataListeners) listener()
  }

  private publishAll(): void {
    this.publishMotion()
    this.publishData()
  }
}

export const deviceSimulation = new DeviceSimulationStore()
export { DEFAULT_CONFIG, isMobileKind }

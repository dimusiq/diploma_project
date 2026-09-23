/**
 * Клиент симулятора: состояние приходит с backend (SSE), команды уходят HTTP.
 */

import {
  fetchSimSnapshot,
  patchSimConfig,
  postApplyScenario,
  postDemoReset,
  postDemoStart,
  postDeviceCommand,
  postFastForward,
  postSimCommand,
  postSimControl,
  postSimSpeed,
  simStreamUrl,
} from "@/api/deviceServer.ts"
import { getApiUrl } from "@/lib/apiClient.ts"
import { getAccessToken } from "@/lib/authStorage.ts"
import { buildTopology } from "./simLayout.ts"
import type {
  DeviceKind,
  DeviceStatus,
  SimCameraDetection,
  SimCameraState,
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
} from "./simTypes.ts"

export const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 50] as const
export type SimSpeed = (typeof SPEED_OPTIONS)[number]

export type SimRunState = "STOPPED" | "RUNNING" | "PAUSED"

type CameraStreamPayload = {
  equipment_id?: string
  detections?: SimCameraDetection[]
  description?: string
  obstacle?: boolean
  frame_index?: number
  status?: SimCameraState
}

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
  speed?: number
  targetSpeed?: number
  waitingFor?: string | null
  waitingSeconds?: number
}

export interface WorkerMotion {
  id: string
  code?: string | null
  name: string
  x: number
  z: number
  heading: number
  speed: number
  status: string
  target?: string | null
  currentZone?: string | null
  employeeCode?: string | null
  workerId?: string | null
  displayName?: string | null
  positionTitle?: string | null
  shift?: string | null
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
  workers?: WorkerMotion[]
  rackFill: RackFill[]
  zonePallets: Record<string, number>
}

export interface SimKpi {
  state: SimRunState
  activeDevices: number
  activeTasks: number
  orders: number
  inventoryItems: number
  inboundTrucks: number
  outboundShipments: number
  eventsPerMin: number
  errors: number
  warnings: number
  faults: number
}

export interface DataSnapshot {
  version: number
  timeSec: number
  dayStartSec: number
  realTime?: string
  state: SimRunState
  running: boolean
  speed: SimSpeed
  scenario?: string
  config: SimConfig
  topology?: SimTopology
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
  occupiedCellIds?: string[]
  palletsTotal: number
  eventCounts: Array<{ type: string; count: number }>
  skuLabels: Record<string, string>
  kpi?: SimKpi
}

const EMPTY_METRICS: SimMetrics = {
  trucksArrived: 0,
  trucksDeparted: 0,
  palletsReceived: 0,
  palletsPutaway: 0,
  palletsPicked: 0,
  palletsShipped: 0,
  ordersCreated: 0,
  ordersShipped: 0,
  ordersLate: 0,
  scans: 0,
  scanFailures: 0,
  faults: 0,
  jams: 0,
  alarms: 0,
  chargeCycles: 0,
  tasksCreated: 0,
  tasksDone: 0,
  eventsTotal: 0,
  orderCycleSumSec: 0,
  orderCycleCount: 0,
  dockBusySec: 0,
  dockSec: 0,
}

function emptyData(): DataSnapshot {
  return {
    version: 0,
    timeSec: 0,
    dayStartSec: 8 * 3600,
    state: "STOPPED",
    running: false,
    speed: 1,
    config: {
      seed: 20260914,
      forklifts: 5,
      agvs: 4,
      amrs: 3,
      workers: 10,
      truckArrivalsPerHour: 6,
      ordersPerHour: 14,
      faultRatePerHour: 0.2,
      scanErrorRate: 0.04,
      jamRatePerHour: 0.8,
      batteryDrainPerMin: 0.35,
      initialFillRatio: 0.72,
      autoRepair: true,
    },
    topology: buildTopology(),
    devices: [],
    trucks: [],
    inbound: [],
    outbound: [],
    tasks: [],
    workers: [],
    events: [],
    metrics: { ...EMPTY_METRICS },
    cellsTotal: 0,
    cellsOccupied: 0,
    palletsTotal: 0,
    eventCounts: [],
    skuLabels: {},
  }
}

function emptyMotion(): MotionSnapshot {
  return {
    version: 0,
    timeSec: 0,
    running: false,
    devices: [],
    trucks: [],
    rackFill: [],
    zonePallets: {},
  }
}

function parseSseBlocks(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.split("\n\n")
  const rest = blocks.pop() ?? ""
  const events: string[] = []
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) events.push(line.slice(5).trim())
    }
  }
  return { events, rest }
}

class DeviceSimulationClient {
  private motionSnapshot: MotionSnapshot = emptyMotion()
  private dataSnapshot: DataSnapshot = emptyData()
  private motionListeners = new Set<() => void>()
  private dataListeners = new Set<() => void>()
  private started = false
  private sseOpen = false
  private abort: AbortController | null = null

  get sseConnected(): boolean {
    return this.sseOpen
  }

  get topology(): SimTopology {
    return this.dataSnapshot.topology ?? buildTopology()
  }

  get dayStartSec(): number {
    return this.dataSnapshot.dayStartSec
  }

  getMotionSnapshot = (): MotionSnapshot => this.motionSnapshot
  getDataSnapshot = (): DataSnapshot => this.dataSnapshot

  subscribeMotion = (listener: () => void): (() => void) => {
    this.motionListeners.add(listener)
    void this.ensureStarted()
    return () => this.motionListeners.delete(listener)
  }

  subscribeData = (listener: () => void): (() => void) => {
    this.dataListeners.add(listener)
    void this.ensureStarted()
    return () => this.dataListeners.delete(listener)
  }

  autoStart(): void {
    void this.ensureStarted()
  }

  private notifyMotion(): void {
    for (const listener of this.motionListeners) listener()
  }

  private notifyData(): void {
    for (const listener of this.dataListeners) listener()
  }

  private setSseOpen(open: boolean): void {
    if (this.sseOpen === open) return
    this.sseOpen = open
    this.notifyData()
  }

  private applyData(data: DataSnapshot): void {
    this.dataSnapshot = {
      ...data,
      topology: data.topology ?? this.dataSnapshot.topology ?? buildTopology(),
      speed: data.speed as SimSpeed,
      state: data.state ?? (data.running ? "RUNNING" : "STOPPED"),
    }
    this.notifyData()
  }

  private applyMotion(motion: MotionSnapshot): void {
    this.motionSnapshot = motion
    this.notifyMotion()
  }

  private applyCamera(type: string, payload: CameraStreamPayload | undefined): void {
    if (!payload) return
    const equipmentId = payload.equipment_id ?? payload.status?.equipment_id
    if (!equipmentId) return
    const devices = this.dataSnapshot.devices.map((device) => {
      if (device.id !== equipmentId) return device
      const current = device.camera ?? { installed: true }
      if (type === "camera.detection_cleared") {
        return {
          ...device,
          cameraHold: false,
          camera: {
            ...current,
            obstacle: false,
            detections: [],
            detection_count: 0,
            description: "Обнаружено:\nнет объектов",
          },
        }
      }
      const detections = payload.detections ?? current.detections
      return {
        ...device,
        cameraHold: payload.obstacle ?? payload.status?.obstacle ?? device.cameraHold,
        camera: {
          ...current,
          ...(payload.status ?? {}),
          detections,
          detection_count: detections?.length ?? current.detection_count,
          description: payload.description ?? current.description,
          obstacle: payload.obstacle ?? payload.status?.obstacle ?? current.obstacle,
          frame_index: payload.frame_index ?? current.frame_index,
        },
      }
    })
    this.dataSnapshot = { ...this.dataSnapshot, devices }
    this.notifyData()
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const snap = await fetchSimSnapshot<DataSnapshot>()
      this.applyData(snap)
    } catch {
      this.started = false
      return
    }
    void this.streamLoop()
  }

  private async streamLoop(): Promise<void> {
    while (this.started) {
      const token = getAccessToken()
      if (!token) {
        this.setSseOpen(false)
        await new Promise((r) => setTimeout(r, 4000))
        continue
      }
      this.abort?.abort()
      this.abort = new AbortController()
      try {
        const res = await fetch(getApiUrl(simStreamUrl()), {
          headers: { Authorization: `Bearer ${token}` },
          signal: this.abort.signal,
        })
        if (!res.ok || !res.body) {
          this.setSseOpen(false)
          await new Promise((r) => setTimeout(r, 4000))
          continue
        }
        this.setSseOpen(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            this.setSseOpen(false)
            break
          }
          buf += decoder.decode(value, { stream: true })
          const { events, rest } = parseSseBlocks(buf)
          buf = rest
          for (const raw of events) {
            if (!raw) continue
            try {
              const msg = JSON.parse(raw) as {
                type?: string
                payload?: DataSnapshot | MotionSnapshot
              }
              if (msg.type === "data" && msg.payload) {
                this.applyData(msg.payload as DataSnapshot)
              } else if (msg.type === "motion" && msg.payload) {
                this.applyMotion(msg.payload as MotionSnapshot)
              } else if (
                msg.type === "camera.status" ||
                msg.type === "camera.detection" ||
                msg.type === "camera.detection_cleared" ||
                msg.type === "camera.frame"
              ) {
                this.applyCamera(msg.type, msg.payload as CameraStreamPayload)
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        this.setSseOpen(false)
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  start(): void {
    void postSimControl<DataSnapshot>("start").then((d) => this.applyData(d))
  }

  pause(): void {
    void postSimControl<DataSnapshot>("pause").then((d) => this.applyData(d))
  }

  stop(): void {
    void postSimControl<DataSnapshot>("stop").then((d) => this.applyData(d))
  }

  toggle(): void {
    if (this.dataSnapshot.state === "RUNNING") this.pause()
    else this.start()
  }

  reset(config: Partial<SimConfig> = {}): void {
    void postSimControl<DataSnapshot>("reset", config).then((d) => this.applyData(d))
  }

  /**
   * Reset Demo ≠ RESET: backend `reset_demo()` вызывает `reset(DEMO_CONFIG)`
   * (демонстрационный профиль: seed, нулевые отказы, fill). Обычный RESET
   * сбрасывает текущий config без подмены на DEMO_CONFIG. Один и тот же runtime.
   */
  private demoOp: Promise<unknown> | null = null

  startDemo(): Promise<unknown> {
    if (this.demoOp) return this.demoOp
    this.demoOp = postDemoStart<DataSnapshot>()
      .then((d) => this.applyData(d))
      .finally(() => {
        this.demoOp = null
      })
    return this.demoOp
  }

  resetDemo(): Promise<unknown> {
    if (this.demoOp) return this.demoOp
    this.demoOp = postDemoReset<DataSnapshot>()
      .then((d) => this.applyData(d))
      .finally(() => {
        this.demoOp = null
      })
    return this.demoOp
  }

  setSpeed(speed: SimSpeed): void {
    void postSimSpeed<DataSnapshot>(speed).then((d) => this.applyData(d))
  }

  setConfig(patch: Partial<SimConfig>): void {
    void patchSimConfig<DataSnapshot>(patch).then((d) => this.applyData(d))
  }

  command(command: SimCommand): void {
    void postSimCommand<DataSnapshot>(command).then((d) => this.applyData(d))
  }

  deviceCommand(deviceId: string, command: string): void {
    void postDeviceCommand(deviceId, command).then(() =>
      fetchSimSnapshot<DataSnapshot>().then((d) => this.applyData(d)),
    )
  }

  applyScenario(code: string): void {
    void postApplyScenario<DataSnapshot>(code).then((d) => this.applyData(d))
  }

  fastForward(seconds: number): void {
    void postFastForward<DataSnapshot>(seconds).then((d) => this.applyData(d))
  }

  countFaults(): number {
    return this.dataSnapshot.devices.filter(
      (device) =>
        device.status === "fault" || device.status === "jam" || device.alarm,
    ).length
  }
}

export { isMobileKind } from "./simFormat.ts"

export const deviceSimulation = new DeviceSimulationClient()

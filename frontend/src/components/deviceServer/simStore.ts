/**
 * Клиент симулятора: состояние приходит с backend (SSE), команды уходят HTTP.
 */
import { getApiUrl } from "@/lib/apiClient.ts"
import { getAccessToken } from "@/lib/authStorage.ts"
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
import { buildTopology } from "./simLayout.ts"
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
} from "./simTypes.ts"

export const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 50] as const
export type SimSpeed = (typeof SPEED_OPTIONS)[number]

export type SimRunState = "STOPPED" | "RUNNING" | "PAUSED"

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
      initialFillRatio: 0.55,
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
  private abort: AbortController | null = null

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
          await new Promise((r) => setTimeout(r, 4000))
          continue
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
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
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* reconnect */
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

  startDemo(): void {
    void postDemoStart<DataSnapshot>().then((d) => this.applyData(d))
  }

  resetDemo(): void {
    void postDemoReset<DataSnapshot>().then((d) => this.applyData(d))
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

export const deviceSimulation = new DeviceSimulationClient()

export function isMobileKind(kind: DeviceKind): boolean {
  return kind === "forklift" || kind === "agv" || kind === "amr"
}

/**
 * Создание начального состояния мира: парк устройств, персонал,
 * номенклатура и стартовые остатки на стеллажах.
 */

import {
  buildCells,
  buildTopology,
  PACKING_POINT,
  RECEIVING_STAGING,
  SHIPPING_STAGING,
  ZONE_CHARGING,
  ZONE_PACKING,
  ZONE_RECEIVING,
  ZONE_SHIPPING,
  ZONE_STORAGE,
  zoneCenter,
} from "./simLayout.ts"
import { randInt, randPick } from "./simRandom.ts"
import type {
  DeviceKind,
  SensorMetric,
  SimConfig,
  SimDevice,
  SimMetrics,
  SimPallet,
  SimSku,
  SimWorker,
  SimWorld,
  Vec2,
  WorkerRole,
} from "./simTypes.ts"

export const DEFAULT_CONFIG: SimConfig = {
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
}

/** Модельные сутки начинаются в 08:00 — начало первой смены. */
export const DAY_START_SEC = 8 * 3600

const SKUS: SimSku[] = [
  {
    id: "sku-1",
    code: "SKU-1001",
    name: "Вода питьевая, 0.5 л",
    cold: false,
    unitsPerPallet: 1200,
  },
  {
    id: "sku-2",
    code: "SKU-1002",
    name: "Крупа гречневая, 1 кг",
    cold: false,
    unitsPerPallet: 800,
  },
  {
    id: "sku-3",
    code: "SKU-1003",
    name: "Молоко УВТ, 1 л",
    cold: true,
    unitsPerPallet: 600,
  },
  {
    id: "sku-4",
    code: "SKU-1004",
    name: "Кофе молотый, 250 г",
    cold: false,
    unitsPerPallet: 960,
  },
  {
    id: "sku-5",
    code: "SKU-1005",
    name: "Сыр полутвёрдый, 400 г",
    cold: true,
    unitsPerPallet: 540,
  },
  {
    id: "sku-6",
    code: "SKU-1006",
    name: "Бумага А4, 500 л.",
    cold: false,
    unitsPerPallet: 400,
  },
  {
    id: "sku-7",
    code: "SKU-1007",
    name: "Стеклоомыватель, 5 л",
    cold: false,
    unitsPerPallet: 320,
  },
  {
    id: "sku-8",
    code: "SKU-1008",
    name: "Корм для животных, 3 кг",
    cold: false,
    unitsPerPallet: 480,
  },
]

const WORKER_NAMES = [
  "Иванов А.",
  "Петров С.",
  "Сидорова М.",
  "Кузнецов Д.",
  "Смирнова О.",
  "Волков И.",
  "Егорова Н.",
  "Морозов П.",
  "Зайцева Л.",
  "Орлов В.",
  "Гусев Р.",
  "Лебедева Т.",
]

const WORKER_ROLE_CYCLE: WorkerRole[] = [
  "receiver",
  "picker",
  "picker",
  "loader",
  "operator",
  "supervisor",
]

interface SensorSpec {
  code: string
  name: string
  zoneId: string
  pos: Vec2
  metricKind: SensorMetric
  unit: string
  value: number
  min: number
  max: number
}

const SENSOR_SPECS: SensorSpec[] = [
  {
    code: "T-01",
    name: "Температура, хранение А",
    zoneId: ZONE_STORAGE,
    pos: { x: 34, z: 9 },
    metricKind: "temperature",
    unit: "°C",
    value: 19,
    min: 14,
    max: 26,
  },
  {
    code: "T-02",
    name: "Температура, холодная зона",
    zoneId: ZONE_STORAGE,
    pos: { x: 60, z: 54 },
    metricKind: "temperature",
    unit: "°C",
    value: 4.5,
    min: 1,
    max: 8,
  },
  {
    code: "H-01",
    name: "Влажность, хранение B",
    zoneId: ZONE_STORAGE,
    pos: { x: 48, z: 39 },
    metricKind: "humidity",
    unit: "%",
    value: 48,
    min: 30,
    max: 68,
  },
  {
    code: "V-01",
    name: "Вибрация, конвейер упаковки",
    zoneId: ZONE_PACKING,
    pos: { x: 88, z: 18 },
    metricKind: "vibration",
    unit: "мм/с",
    value: 0.6,
    min: 0,
    max: 2.2,
  },
  {
    code: "C-01",
    name: "CO₂, приёмка",
    zoneId: ZONE_RECEIVING,
    pos: { x: 8, z: 16 },
    metricKind: "co2",
    unit: "ppm",
    value: 520,
    min: 350,
    max: 1100,
  },
  {
    code: "W-01",
    name: "Весы паллетные, упаковка",
    zoneId: ZONE_PACKING,
    pos: { x: 84, z: 22 },
    metricKind: "weight",
    unit: "кг",
    value: 420,
    min: 0,
    max: 1450,
  },
  {
    code: "P-01",
    name: "Фотобарьер, буфер отгрузки",
    zoneId: ZONE_SHIPPING,
    pos: { x: 84, z: 38 },
    metricKind: "photo_eye",
    unit: "",
    value: 0,
    min: 0,
    max: 1,
  },
]

function createDevice(
  id: string,
  kind: DeviceKind,
  name: string,
  pos: Vec2,
  overrides: Partial<SimDevice> = {},
): SimDevice {
  return {
    id,
    kind,
    name,
    status: "idle",
    pos: { ...pos },
    homePos: { ...pos },
    zoneId: null,
    speed: 0,
    battery: null,
    health: 100,
    online: true,
    alarm: false,
    taskId: null,
    palletId: null,
    workerId: null,
    phase: null,
    phaseTimer: 0,
    path: [],
    metric: null,
    metricKind: null,
    metricUnit: null,
    metricMin: null,
    metricMax: null,
    history: [],
    busySec: 0,
    faultCount: 0,
    tasksDone: 0,
    repairTimer: 0,
    lastEventAt: 0,
    ...overrides,
  }
}

function createMetrics(): SimMetrics {
  return {
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
}

function createDevices(config: SimConfig): SimDevice[] {
  const devices: SimDevice[] = []
  const topology = buildTopology()

  for (let i = 1; i <= config.forklifts; i += 1) {
    devices.push(
      createDevice(
        `fl-${i}`,
        "forklift",
        `Погрузчик FL-${String(i).padStart(2, "0")}`,
        { x: 6 + ((i - 1) % 4) * 3.5, z: 40 - Math.floor((i - 1) / 4) * 4 },
        { speed: 2.4, battery: 72 + ((i * 7) % 25), zoneId: ZONE_RECEIVING },
      ),
    )
  }
  for (let i = 1; i <= config.agvs; i += 1) {
    devices.push(
      createDevice(
        `agv-${i}`,
        "agv",
        `AGV-${String(i).padStart(2, "0")}`,
        { x: 22, z: 9 + (i - 1) * 15 },
        { speed: 1.5, battery: 65 + ((i * 11) % 30), zoneId: ZONE_STORAGE },
      ),
    )
  }
  for (let i = 1; i <= config.amrs; i += 1) {
    devices.push(
      createDevice(
        `amr-${i}`,
        "amr",
        `AMR-${String(i).padStart(2, "0")}`,
        { x: 78, z: 24 + (i - 1) * 15 },
        { speed: 1.9, battery: 60 + ((i * 13) % 35), zoneId: ZONE_STORAGE },
      ),
    )
  }

  devices.push(
    createDevice(
      "cnv-1",
      "conveyor",
      "Конвейер приёмки CV-01",
      { x: 18, z: 24 },
      {
        status: "running",
        zoneId: ZONE_RECEIVING,
        metric: 0,
        metricKind: "weight",
        metricUnit: "пал/ч",
        metricMin: 0,
        metricMax: 60,
      },
    ),
    createDevice(
      "cnv-2",
      "conveyor",
      "Конвейер упаковки CV-02",
      { x: 88, z: 14 },
      {
        status: "running",
        zoneId: ZONE_PACKING,
        metric: 0,
        metricKind: "weight",
        metricUnit: "пал/ч",
        metricMin: 0,
        metricMax: 60,
      },
    ),
  )

  for (const dock of topology.docks) {
    devices.push(
      createDevice(dock.id, "dock_door", `Ворота ${dock.code}`, dock.pos, {
        zoneId: dock.direction === "inbound" ? ZONE_RECEIVING : ZONE_SHIPPING,
      }),
    )
    devices.push(
      createDevice(
        `scn-${dock.code}`,
        "scanner",
        `Сканер ворот ${dock.code}`,
        {
          x: dock.pos.x + (dock.direction === "inbound" ? 2 : -2),
          z: dock.pos.z,
        },
        {
          zoneId: dock.direction === "inbound" ? ZONE_RECEIVING : ZONE_SHIPPING,
        },
      ),
    )
  }

  devices.push(
    createDevice(
      "scn-PACK",
      "scanner",
      "Сканер упаковки SC-PACK",
      PACKING_POINT,
      {
        zoneId: ZONE_PACKING,
      },
    ),
  )

  for (const spec of SENSOR_SPECS) {
    devices.push(
      createDevice(
        `sns-${spec.code}`,
        "sensor",
        `Датчик ${spec.code}: ${spec.name}`,
        spec.pos,
        {
          status: "running",
          zoneId: spec.zoneId,
          metric: spec.value,
          metricKind: spec.metricKind,
          metricUnit: spec.unit,
          metricMin: spec.min,
          metricMax: spec.max,
          history: [spec.value],
        },
      ),
    )
  }

  const terminalSpots: Array<[string, string, Vec2]> = [
    ["TRM-01", "Терминал приёмки", RECEIVING_STAGING],
    ["TRM-02", "Терминал отбора, зона A", { x: 22, z: 24 }],
    ["TRM-03", "Терминал отбора, зона B", { x: 78, z: 39 }],
    ["TRM-04", "Терминал отгрузки", SHIPPING_STAGING],
  ]
  for (const [code, name, pos] of terminalSpots) {
    devices.push(
      createDevice(`trm-${code}`, "terminal", `${name} (${code})`, pos, {
        status: "idle",
      }),
    )
  }

  const chargingCenter = zoneCenter(ZONE_CHARGING)
  for (let i = 1; i <= 4; i += 1) {
    devices.push(
      createDevice(
        `chg-${i}`,
        "charger",
        `Зарядная станция CH-0${i}`,
        { x: chargingCenter.x - 5 + (i - 1) * 3.4, z: chargingCenter.z },
        { zoneId: ZONE_CHARGING },
      ),
    )
  }

  devices.push(
    createDevice(
      "prn-1",
      "printer",
      "Принтер этикеток PR-01",
      { x: 12, z: 30 },
      {
        zoneId: ZONE_RECEIVING,
      },
    ),
    createDevice(
      "prn-2",
      "printer",
      "Принтер этикеток PR-02",
      { x: 82, z: 20 },
      {
        zoneId: ZONE_PACKING,
      },
    ),
  )

  return devices
}

function createWorkers(config: SimConfig): SimWorker[] {
  const workers: SimWorker[] = []
  for (let i = 0; i < config.workers; i += 1) {
    workers.push({
      id: `wrk-${i + 1}`,
      name: WORKER_NAMES[i % WORKER_NAMES.length],
      role: WORKER_ROLE_CYCLE[i % WORKER_ROLE_CYCLE.length],
      status: "idle",
      deviceId: null,
      taskId: null,
      tasksDone: 0,
      breakTimer: 0,
    })
  }
  return workers
}

export function createWorld(configInput: Partial<SimConfig> = {}): SimWorld {
  const config: SimConfig = { ...DEFAULT_CONFIG, ...configInput }
  const topology = buildTopology()
  const cells = buildCells(topology.racks)
  const devices = createDevices(config)
  const world: SimWorld = {
    config,
    topology,
    timeSec: 0,
    dayStartSec: DAY_START_SEC,
    skus: SKUS,
    cells,
    cellById: new Map(cells.map((cell) => [cell.id, cell])),
    devices,
    deviceById: new Map(devices.map((device) => [device.id, device])),
    pallets: new Map(),
    trucks: [],
    inbound: [],
    outbound: [],
    tasks: [],
    workers: createWorkers(config),
    events: [],
    eventCountsByType: new Map(),
    metrics: createMetrics(),
    accumulators: {
      truckArrival: 0,
      order: 0,
      sensorSample: 0,
      replenish: 0,
      shift: 0,
    },
    counters: {
      event: 0,
      truck: 0,
      inbound: 0,
      outbound: 0,
      pallet: 0,
      task: 0,
    },
    rngState: config.seed | 0,
  }

  seedInventory(world)
  return world
}

/** Стартовые остатки: часть ячеек заполнена паллетами со случайным SKU. */
function seedInventory(world: SimWorld): void {
  const target = Math.floor(world.cells.length * world.config.initialFillRatio)
  const step = Math.max(1, Math.floor(world.cells.length / Math.max(1, target)))
  for (
    let i = 0;
    i < world.cells.length && world.pallets.size < target;
    i += step
  ) {
    const cell = world.cells[i]
    const sku = randPick(world, world.skus)
    world.counters.pallet += 1
    const pallet: SimPallet = {
      id: `pal-${world.counters.pallet}`,
      sscc: formatSscc(world.counters.pallet),
      skuId: sku.id,
      qty: Math.round(sku.unitsPerPallet * (0.5 + randInt(world, 5, 10) / 10)),
      locationKind: "cell",
      locationId: cell.id,
      pos: { ...cell.pos },
      createdAt: 0,
      orderId: null,
    }
    world.pallets.set(pallet.id, pallet)
    cell.palletId = pallet.id
  }
}

export function formatSscc(sequence: number): string {
  return `00375${String(sequence).padStart(12, "0")}`
}

export const SIM_SKUS = SKUS
export { PACKING_POINT, RECEIVING_STAGING, SHIPPING_STAGING }

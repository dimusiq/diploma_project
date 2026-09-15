import { describe, expect, it } from "vitest"
import {
  advanceWorld,
  applyCommand,
  spawnInboundTruck,
  spawnOutboundOrder,
} from "../simEngine.ts"
import { routeBetween } from "../simLayout.ts"
import { createWorld } from "../simWorld.ts"

const FAST_CONFIG = {
  truckArrivalsPerHour: 8,
  ordersPerHour: 20,
  faultRatePerHour: 0,
  jamRatePerHour: 0,
  scanErrorRate: 0,
}

describe("маршрутизация по проездам", () => {
  it("строит путь между точками и заканчивает его в цели", () => {
    const path = routeBetween({ x: 6, z: 24 }, { x: 50, z: 41 })
    expect(path.length).toBeGreaterThan(1)
    const last = path[path.length - 1]
    expect(last).toEqual({ x: 50, z: 41 })
  })

  it("не возвращает пустой маршрут для совпадающих точек", () => {
    const path = routeBetween({ x: 10, z: 10 }, { x: 10, z: 10 })
    expect(path).toHaveLength(1)
  })
})

describe("детерминированность", () => {
  it("одинаковое зерно даёт одинаковый ход симуляции", () => {
    const a = createWorld({ seed: 777, ...FAST_CONFIG })
    const b = createWorld({ seed: 777, ...FAST_CONFIG })
    advanceWorld(a, 3600)
    advanceWorld(b, 3600)
    expect(b.metrics.eventsTotal).toBe(a.metrics.eventsTotal)
    expect(b.metrics.palletsReceived).toBe(a.metrics.palletsReceived)
    expect(b.metrics.ordersShipped).toBe(a.metrics.ordersShipped)
  })

  it("разное зерно расходится по сценарию", () => {
    const a = createWorld({ seed: 1, ...FAST_CONFIG })
    const b = createWorld({ seed: 2, ...FAST_CONFIG })
    advanceWorld(a, 3600)
    advanceWorld(b, 3600)
    expect(b.metrics.eventsTotal).not.toBe(a.metrics.eventsTotal)
  })
})

describe("сквозной процесс склада", () => {
  it("принимает транспорт, размещает товар и отгружает заказы", () => {
    const world = createWorld({ seed: 42, ...FAST_CONFIG })
    advanceWorld(world, 4 * 3600)

    expect(world.metrics.trucksArrived).toBeGreaterThan(0)
    expect(world.metrics.palletsReceived).toBeGreaterThan(0)
    expect(world.metrics.palletsPutaway).toBeGreaterThan(0)
    expect(world.metrics.ordersCreated).toBeGreaterThan(0)
    expect(world.metrics.palletsPicked).toBeGreaterThan(0)
    expect(world.metrics.ordersShipped).toBeGreaterThan(0)
    expect(world.metrics.palletsShipped).toBeGreaterThan(0)
  })

  it("сохраняет целостность: паллета лежит там, где её учитывает ячейка", () => {
    const world = createWorld({ seed: 9, ...FAST_CONFIG })
    advanceWorld(world, 2 * 3600)

    for (const cell of world.cells) {
      if (cell.palletId === null) continue
      const pallet = world.pallets.get(cell.palletId)
      expect(pallet).toBeDefined()
      expect(pallet?.locationKind).toBe("cell")
      expect(pallet?.locationId).toBe(cell.id)
    }

    // Одна паллета не может лежать в двух ячейках одновременно.
    const occupied = world.cells
      .filter((cell) => cell.palletId !== null)
      .map((cell) => cell.palletId as string)
    expect(new Set(occupied).size).toBe(occupied.length)
  })

  it("не оставляет устройство с заданием, которое уже завершено", () => {
    const world = createWorld({ seed: 11, ...FAST_CONFIG })
    advanceWorld(world, 2 * 3600)
    for (const device of world.devices) {
      if (!device.taskId) continue
      const task = world.tasks.find((item) => item.id === device.taskId)
      expect(task?.status).not.toBe("done")
    }
  })

  it("журнал событий ограничен и содержит события всех основных процессов", () => {
    const world = createWorld({ seed: 5, ...FAST_CONFIG })
    advanceWorld(world, 3 * 3600)
    expect(world.events.length).toBeLessThanOrEqual(400)
    const types = new Set([...world.eventCountsByType.keys()])
    expect(types.has("truck.arrived")).toBe(true)
    expect(types.has("putaway.completed")).toBe(true)
    expect(types.has("order.created")).toBe(true)
    expect(types.has("pick.completed")).toBe(true)
  })
})

describe("команды оператора", () => {
  it("ручное прибытие транспорта создаёт поставку", () => {
    const world = createWorld({
      seed: 3,
      truckArrivalsPerHour: 0,
      ordersPerHour: 0,
    })
    spawnInboundTruck(world)
    expect(world.trucks).toHaveLength(1)
    expect(world.inbound).toHaveLength(1)
    expect(world.inbound[0].palletsPlanned).toBeGreaterThan(0)
  })

  it("срочный заказ получает короткий срок и высокий приоритет", () => {
    const world = createWorld({
      seed: 3,
      truckArrivalsPerHour: 0,
      ordersPerHour: 0,
    })
    const order = spawnOutboundOrder(world, true)
    expect(order.priority).toBe("urgent")
    expect(order.dueAt - world.timeSec).toBeLessThanOrEqual(2400)
  })

  it("инъекция отказа переводит устройство в отказ и освобождает задание", () => {
    const world = createWorld({ seed: 4, ...FAST_CONFIG, autoRepair: false })
    advanceWorld(world, 1800)
    const busy = world.devices.find(
      (device) => device.kind === "forklift" && device.taskId !== null,
    )
    expect(busy).toBeDefined()
    const taskId = busy!.taskId
    applyCommand(world, { type: "injectFault", deviceId: busy!.id })
    expect(busy!.status).toBe("fault")
    expect(busy!.taskId).toBeNull()
    const task = world.tasks.find((item) => item.id === taskId)
    expect(task?.status).toBe("pending")
  })

  it("аварийный останов отключает всю мобильную технику, возобновление — включает", () => {
    const world = createWorld({ seed: 6, ...FAST_CONFIG })
    advanceWorld(world, 900)
    applyCommand(world, { type: "emergencyStop" })
    const mobile = world.devices.filter((device) =>
      ["forklift", "agv", "amr"].includes(device.kind),
    )
    expect(mobile.every((device) => device.online === false)).toBe(true)

    applyCommand(world, { type: "resumeAll" })
    expect(mobile.every((device) => device.online)).toBe(true)
  })

  it("отключённое устройство не получает новых заданий", () => {
    const world = createWorld({ seed: 7, ...FAST_CONFIG })
    const forklift = world.devices.find((device) => device.kind === "forklift")!
    applyCommand(world, { type: "toggleDeviceOnline", deviceId: forklift.id })
    advanceWorld(world, 1800)
    expect(forklift.status).toBe("offline")
    expect(forklift.taskId).toBeNull()
  })
})

describe("устройства и телеметрия", () => {
  it("датчики накапливают историю измерений", () => {
    const world = createWorld({ seed: 8, ...FAST_CONFIG })
    advanceWorld(world, 600)
    const sensor = world.devices.find((device) => device.kind === "sensor")!
    expect(sensor.history.length).toBeGreaterThan(1)
    expect(sensor.history.length).toBeLessThanOrEqual(40)
  })

  it("показания датчиков держатся у уставки, аварии редкие", () => {
    const world = createWorld({ seed: 21, ...FAST_CONFIG })
    advanceWorld(world, 4 * 3600)
    const sensors = world.devices.filter(
      (device) => device.kind === "sensor" && device.metricKind !== "weight",
    )
    for (const sensor of sensors) {
      const min = sensor.metricMin!
      const max = sensor.metricMax!
      const slack = (max - min) * 0.5
      // Возврат к среднему не даёт показаниям уйти в бесконечный дрейф.
      expect(sensor.metric!).toBeGreaterThan(min - slack)
      expect(sensor.metric!).toBeLessThan(max + slack)
    }
    expect(world.metrics.alarms).toBeLessThan(30)
  })

  it("техника разряжается и уходит на зарядную станцию", () => {
    const world = createWorld({
      seed: 12,
      ...FAST_CONFIG,
      batteryDrainPerMin: 4,
    })
    advanceWorld(world, 3 * 3600)
    expect(world.metrics.chargeCycles).toBeGreaterThan(0)
  })
})

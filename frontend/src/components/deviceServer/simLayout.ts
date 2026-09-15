/**
 * Геометрия склада: зоны, стеллажи, ячейки, ворота и маршрутизация по проездам.
 *
 * План склада 104 × 64 м. Ось x — длина стеллажа (запад → восток),
 * ось z — между сдвоенными блоками (сверху вниз).
 * 8 back-to-back блоков: R01A спиной к R01B, проезд только снаружи.
 */

import type {
  SimCell,
  SimDock,
  SimRack,
  SimTopology,
  SimZone,
  Vec2,
} from "./simTypes.ts"

export const WAREHOUSE_WIDTH = 104
export const WAREHOUSE_DEPTH = 64

export const WEST_CORRIDOR_X = 22
export const EAST_CORRIDOR_X = 78

const STORAGE_MIN_X = 26
const STORAGE_MAX_X = 74

const RACK_X = 26
const RACK_WIDTH = 48
const RACK_DEPTH = 2.4
const RACK_BAYS = 12
const RACK_LEVELS = 3
const BACK_GAP = 0.2
const BLOCK_COUNT = 8
const BLOCK_DEPTH = 2 * RACK_DEPTH + BACK_GAP
const AISLE_WIDTH = 2.5
const PITCH = BLOCK_DEPTH + AISLE_WIDTH
const FIRST_BLOCK_Z = 3
const APPROACH_OFFSET = 1.2

function blockOriginZ(index: number): number {
  return FIRST_BLOCK_Z + index * PITCH
}

function workAisleCenters(): number[] {
  const centers = [FIRST_BLOCK_Z / 2]
  for (let index = 0; index < BLOCK_COUNT; index += 1) {
    const south = blockOriginZ(index) + BLOCK_DEPTH
    const northNext =
      index + 1 < BLOCK_COUNT ? blockOriginZ(index + 1) : WAREHOUSE_DEPTH
    centers.push((south + northNext) / 2)
  }
  return centers
}

const AISLE_Z = workAisleCenters()
const CORRIDOR_X = [WEST_CORRIDOR_X, EAST_CORRIDOR_X]

export const ZONES: SimZone[] = [
  {
    id: "zone-recv",
    code: "RECV",
    name: "Приёмка",
    kind: "receiving",
    x: 2,
    z: 4,
    w: 18,
    d: 42,
  },
  {
    id: "zone-chrg",
    code: "CHRG",
    name: "Зарядная",
    kind: "charging",
    x: 2,
    z: 50,
    w: 18,
    d: 12,
  },
  {
    id: "zone-stor",
    code: "STOR",
    name: "Хранение",
    kind: "storage",
    x: 22,
    z: 2,
    w: 56,
    d: 60,
  },
  {
    id: "zone-pick",
    code: "PICK",
    name: "Отбор",
    kind: "picking",
    x: 74,
    z: 2,
    w: 6,
    d: 60,
  },
  {
    id: "zone-pack",
    code: "PACK",
    name: "Упаковка",
    kind: "packing",
    x: 80,
    z: 2,
    w: 12,
    d: 24,
  },
  {
    id: "zone-ship",
    code: "SHIP",
    name: "Отгрузка",
    kind: "shipping",
    x: 80,
    z: 30,
    w: 20,
    d: 32,
  },
]

export const ZONE_RECEIVING = "zone-recv"
export const ZONE_CHARGING = "zone-chrg"
export const ZONE_STORAGE = "zone-stor"
export const ZONE_PICKING = "zone-pick"
export const ZONE_PACKING = "zone-pack"
export const ZONE_SHIPPING = "zone-ship"

/** Точка накопления принятого товара в зоне приёмки. */
export const RECEIVING_STAGING: Vec2 = { x: 14, z: 24 }
/** Вход конвейера упаковки. */
export const PACKING_POINT: Vec2 = { x: 84, z: 14 }
/** Буфер готовых к отгрузке паллет. */
export const SHIPPING_STAGING: Vec2 = { x: 86, z: 44 }

export function buildRacks(): SimRack[] {
  const racks: SimRack[] = []
  for (let index = 0; index < BLOCK_COUNT; index += 1) {
    const blockId = `B${String(index + 1).padStart(2, "0")}`
    const origin = blockOriginZ(index)
    const idA = `rack-${index + 1}-A`
    const idB = `rack-${index + 1}-B`
    const pair: Array<["A" | "B", number, string, string]> = [
      ["A", origin, idA, idB],
      ["B", origin + RACK_DEPTH + BACK_GAP, idB, idA],
    ]
    for (const [side, z, ownId, mateId] of pair) {
      racks.push({
        id: ownId,
        code: `R${String(index + 1).padStart(2, "0")}${side}`,
        blockId,
        side,
        backToBackWith: mateId,
        zoneId: ZONE_STORAGE,
        x: RACK_X,
        w: RACK_WIDTH,
        z,
        d: RACK_DEPTH,
        bays: RACK_BAYS,
        levels: RACK_LEVELS,
      })
    }
  }
  return racks
}

export function buildBlocks(racks = buildRacks()) {
  return Array.from({ length: BLOCK_COUNT }, (_, index) => {
    const blockId = `B${String(index + 1).padStart(2, "0")}`
    const pair = racks.filter((rack) => rack.blockId === blockId)
    const rackA = pair.find((rack) => rack.side === "A")
    const rackB = pair.find((rack) => rack.side === "B")
    return {
      id: blockId,
      rackAId: rackA?.id ?? "",
      rackBId: rackB?.id ?? "",
      x: rackA?.x ?? RACK_X,
      z: rackA?.z ?? 0,
      w: rackA?.w ?? RACK_WIDTH,
      d: BLOCK_DEPTH,
    }
  })
}

function cellApproachPos(rack: SimRack, bay: number): Vec2 {
  const bayWidth = rack.w / rack.bays
  const x = rack.x + (bay - 0.5) * bayWidth
  const z =
    rack.side === "B"
      ? rack.z + rack.d + APPROACH_OFFSET
      : rack.z - APPROACH_OFFSET
  return { x, z }
}

export function buildCells(racks: SimRack[]): SimCell[] {
  const cells: SimCell[] = []
  for (const rack of racks) {
    for (let bay = 1; bay <= rack.bays; bay += 1) {
      const pos = cellApproachPos(rack, bay)
      for (let level = 1; level <= rack.levels; level += 1) {
        cells.push({
          id: `${rack.code}-L${level}-C${String(bay).padStart(2, "0")}`,
          rackId: rack.id,
          bay,
          level,
          pos,
          palletId: null,
          blocked: false,
        })
      }
    }
  }
  return cells
}

export function buildDocks(): SimDock[] {
  const inbound: SimDock[] = [10, 22, 34].map((z, index) => ({
    id: `dock-in-${index + 1}`,
    code: `IN-${index + 1}`,
    direction: "inbound" as const,
    pos: { x: 3, z },
    yardPos: { x: -12, z },
  }))
  const outbound: SimDock[] = [34, 44, 54].map((z, index) => ({
    id: `dock-out-${index + 1}`,
    code: `OUT-${index + 1}`,
    direction: "outbound" as const,
    pos: { x: 98, z },
    yardPos: { x: 116, z },
  }))
  return [...inbound, ...outbound]
}

export function buildTopology(): SimTopology {
  const racks = buildRacks()
  return {
    width: WAREHOUSE_WIDTH,
    depth: WAREHOUSE_DEPTH,
    zones: ZONES,
    racks,
    blocks: buildBlocks(racks),
    docks: buildDocks(),
    aisleZ: AISLE_Z,
    corridorX: CORRIDOR_X,
  }
}

export function zoneById(id: string): SimZone | undefined {
  return ZONES.find((zone) => zone.id === id)
}

export function zoneCenter(id: string): Vec2 {
  const zone = zoneById(id)
  if (!zone) return { x: WAREHOUSE_WIDTH / 2, z: WAREHOUSE_DEPTH / 2 }
  return { x: zone.x + zone.w / 2, z: zone.z + zone.d / 2 }
}

export function nearestAisleZ(z: number): number {
  let best = AISLE_Z[0]
  for (const aisle of AISLE_Z) {
    if (Math.abs(aisle - z) < Math.abs(best - z)) best = aisle
  }
  return best
}

function inStorageSpan(x: number): boolean {
  return x > STORAGE_MIN_X - 1 && x < STORAGE_MAX_X + 1
}

function corridorNearest(x: number): number {
  let best = CORRIDOR_X[0]
  for (const corridor of CORRIDOR_X) {
    if (Math.abs(corridor - x) < Math.abs(best - x)) best = corridor
  }
  return best
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.z - b.z) < 0.05
}

/**
 * Маршрут от точки до точки по проездам склада.
 * Возвращает список путевых точек без стартовой; последняя точка — цель.
 */
export function routeBetween(from: Vec2, to: Vec2): Vec2[] {
  const points: Vec2[] = []
  const fromInRacks = inStorageSpan(from.x)
  const toInRacks = inStorageSpan(to.x)

  if (fromInRacks) {
    points.push({ x: from.x, z: nearestAisleZ(from.z) })
  }

  if (fromInRacks && toInRacks) {
    const aisleFrom = nearestAisleZ(from.z)
    const aisleTo = nearestAisleZ(to.z)
    if (aisleFrom !== aisleTo) {
      const corridor = corridorNearest((from.x + to.x) / 2)
      points.push({ x: corridor, z: aisleFrom })
      points.push({ x: corridor, z: aisleTo })
    }
    points.push({ x: to.x, z: aisleTo })
  } else if (fromInRacks && !toInRacks) {
    const corridor = corridorNearest(to.x)
    points.push({ x: corridor, z: nearestAisleZ(from.z) })
    points.push({ x: corridor, z: to.z })
  } else if (!fromInRacks && toInRacks) {
    const corridor = corridorNearest(from.x)
    points.push({ x: corridor, z: from.z })
    points.push({ x: corridor, z: nearestAisleZ(to.z) })
    points.push({ x: to.x, z: nearestAisleZ(to.z) })
  } else if (corridorNearest(from.x) !== corridorNearest(to.x)) {
    // Пересечение склада с запада на восток (или обратно) — через проезд.
    const aisle = nearestAisleZ((from.z + to.z) / 2)
    points.push({ x: corridorNearest(from.x), z: from.z })
    points.push({ x: corridorNearest(from.x), z: aisle })
    points.push({ x: corridorNearest(to.x), z: aisle })
    points.push({ x: corridorNearest(to.x), z: to.z })
  } else {
    points.push({ x: from.x, z: to.z })
  }

  points.push({ x: to.x, z: to.z })

  const result: Vec2[] = []
  let previous = from
  for (const point of points) {
    if (samePoint(previous, point)) continue
    result.push(point)
    previous = point
  }
  return result.length > 0 ? result : [{ x: to.x, z: to.z }]
}

export function pathLength(from: Vec2, path: Vec2[]): number {
  let total = 0
  let previous = from
  for (const point of path) {
    total += distance(previous, point)
    previous = point
  }
  return total
}

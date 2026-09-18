/**
 * Occupancy → instanced pallet/cargo transforms.
 * One occupied cell still produces the same visual pallet+boxes, batched for GPU.
 */
import {
  buildPalletLaneXforms,
  palletCargoVariant,
  type RackPartXform,
} from "@/components/warehouse3d/palletRackLayout.ts"
import { parseSlotKeyZeroBased } from "@/components/warehouse3d/twin3dDerived.ts"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

export const TWIN_CELL_COUNT = 16 * 12 * 3
export const MAX_PALLET_LANES = TWIN_CELL_COUNT * 2
export const MAX_STRINGERS = MAX_PALLET_LANES * 3
export const MAX_SLATS = MAX_PALLET_LANES * 5
export const MAX_BOXES = MAX_PALLET_LANES * 4

/** Baseline cost of the previous per-cell PalletLoad/StorageCell approach. */
export const TWIN_PERF_BASELINE = {
  occupiedCells: 449,
  lanes: 2,
  meshesPerPallet: 11,
  hitboxes: TWIN_CELL_COUNT,
  occupancyMeshes: 449 * 2 * 11 + TWIN_CELL_COUNT,
  sseMotionHz: 20,
  sseDataHz: 4,
  lights: 5,
  dprMax: 1.75,
  contactShadows: true,
} as const

function shift(
  item: RackPartXform,
  x: number,
  y: number,
  z: number,
): RackPartXform {
  return {
    position: [item.position[0] + x, item.position[1] + y, item.position[2] + z],
    rotation: item.rotation,
    scale: item.scale,
  }
}

export type OccupancyInstances = {
  occupiedCount: number
  palletCount: number
  stringers: RackPartXform[]
  slats: RackPartXform[]
  boxes: [RackPartXform[], RackPartXform[], RackPartXform[]]
  hitboxes: RackPartXform[]
  cells: CellInfo[]
}

export function buildOccupancyInstances(
  occupiedKeys: Iterable<string>,
  geom: WarehouseGeometry,
): OccupancyInstances {
  const occupied = new Set(occupiedKeys)
  const boxW = geom.cellSize * 0.88
  const boxH = geom.cellHeight
  const boxD = Math.min(geom.cellDepth, geom.rackDepth * 0.72)
  const lanes = boxW >= 2.2 ? 2 : 1
  const offsets = lanes >= 2 ? [-0.66, 0.66] : [0]
  const stringers: RackPartXform[] = []
  const slats: RackPartXform[] = []
  const boxes: [RackPartXform[], RackPartXform[], RackPartXform[]] = [
    [],
    [],
    [],
  ]
  const hitboxes: RackPartXform[] = []
  const cells: CellInfo[] = []
  let palletCount = 0

  for (let row = 0; row < geom.rackRows; row += 1) {
    for (let level = 0; level < geom.levels; level += 1) {
      for (let ix = 0; ix < geom.cellsLength; ix += 1) {
        for (let iz = 0; iz < geom.cellsDepth; iz += 1) {
          const key = geom.cellKey(row, level, ix, iz)
          const filled = occupied.has(key)
          const [wx, wy, wz] = geom.getCellWorldPosition(row, level, ix, iz)
          hitboxes.push({
            position: [wx, wy, wz],
            scale: [boxW, boxH, boxD],
          })
          cells.push({
            row,
            level,
            cellX: ix,
            cellZ: iz,
            filled,
          })
          if (!filled) continue
          const originY = wy - boxH / 2 + 0.05
          const lane = buildPalletLaneXforms(palletCargoVariant(key), boxH)
          for (const ox of offsets) {
            palletCount += 1
            const x = wx + ox
            for (const part of lane.stringers) {
              stringers.push(shift(part, x, originY, wz))
            }
            for (const part of lane.slats) {
              slats.push(shift(part, x, originY, wz))
            }
            for (const part of lane.boxes) {
              boxes[lane.palette].push(shift(part, x, originY, wz))
            }
          }
        }
      }
    }
  }

  return {
    occupiedCount: occupied.size,
    palletCount,
    stringers,
    slats,
    boxes,
    hitboxes,
    cells,
  }
}

export function occupancyKeySignature(ids: string[] | undefined | null): string {
  if (!ids?.length) return ""
  return ids.join("\0")
}

export function parseOccupiedSlotKeys(
  keys: Iterable<string>,
): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = []
  for (const key of keys) {
    const parsed = parseSlotKeyZeroBased(key)
    if (parsed) out.push(parsed)
  }
  return out
}

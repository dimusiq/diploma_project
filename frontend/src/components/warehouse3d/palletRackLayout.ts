/**
 * Локальная раскладка selective pallet rack.
 * Мировые позиции стеллажей не задаются — только размеры из geom/layout.
 */

export type Vec3 = [number, number, number]

export type RackPartXform = {
  position: Vec3
  rotation?: Vec3
  scale?: Vec3
}

export type PalletCargoVariant = {
  boxCount: 2 | 3 | 4
  heightScale: number
  widthScale: number
  depthScale: number
  palette: 0 | 1 | 2
}

export function uprightLocalXs(rackLength: number, bayCount: number): number[] {
  const n = Math.max(1, bayCount)
  const xs: number[] = []
  for (let i = 0; i <= n; i += 1) {
    xs.push(-rackLength / 2 + (i / n) * rackLength)
  }
  return xs
}

export function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function palletCargoVariant(seed: string): PalletCargoVariant {
  const h = hashSeed(seed)
  const boxCount = ([2, 3, 3, 4] as const)[h % 4]
  return {
    boxCount,
    heightScale: 0.88 + ((h >>> 3) % 13) / 100,
    widthScale: 0.96 + ((h >>> 7) % 9) / 100,
    depthScale: 0.96 + ((h >>> 11) % 9) / 100,
    palette: ((h >>> 15) % 3) as 0 | 1 | 2,
  }
}

export function buildSelectiveRackParts(args: {
  rackLength: number
  rackDepth: number
  bayCount: number
  levels: number
  levelHeight: number
  aisleSign: 1 | -1
}): {
  uprights: RackPartXform[]
  basePlates: RackPartXform[]
  beams: RackPartXform[]
  depthBeams: RackPartXform[]
  diagonals: RackPartXform[]
  palletStops: RackPartXform[]
  connectors: RackPartXform[]
  aisleZ: number
  backZ: number
  rackH: number
  xs: number[]
} {
  const {
    rackLength,
    rackDepth,
    bayCount,
    levels,
    levelHeight,
    aisleSign,
  } = args
  const xs = uprightLocalXs(rackLength, bayCount)
  const rackH = levels * levelHeight + 0.08
  const halfD = rackDepth / 2
  const inset = 0.045
  const aisleZ = aisleSign * (halfD - inset)
  const backZ = -aisleSign * (halfD - inset)
  const uprights: RackPartXform[] = []
  const basePlates: RackPartXform[] = []
  const beams: RackPartXform[] = []
  const depthBeams: RackPartXform[] = []
  const diagonals: RackPartXform[] = []
  const palletStops: RackPartXform[] = []
  const connectors: RackPartXform[] = []

  for (const x of xs) {
    for (const z of [aisleZ, backZ]) {
      uprights.push({
        position: [x, rackH / 2, z],
        scale: [1, rackH, 1],
      })
      basePlates.push({
        position: [x, 0.012, z],
      })
    }
    const spanZ = backZ - aisleZ
    const depthLen = Math.abs(spanZ)
    const depthMid = (aisleZ + backZ) / 2
    for (const y of [0.38, rackH * 0.52, rackH - 0.08]) {
      depthBeams.push({
        position: [x, y, depthMid],
        scale: [1, 1, depthLen],
      })
    }
    const dy = rackH * 0.72
    const diagLen = Math.hypot(spanZ, dy)
    diagonals.push({
      position: [x, rackH * 0.42, depthMid],
      rotation: [Math.atan2(-dy, spanZ), 0, 0],
      scale: [1, 1, diagLen],
    })
  }

  const beamLevels = levels + 1
  for (let lvl = 0; lvl < beamLevels; lvl += 1) {
    const y = lvl * levelHeight + 0.05
    for (let bay = 0; bay < bayCount; bay += 1) {
      const x0 = xs[bay] ?? 0
      const x1 = xs[bay + 1] ?? x0
      const cx = (x0 + x1) / 2
      const span = Math.max(0.2, Math.abs(x1 - x0) - 0.08)
      for (const z of [aisleZ, backZ]) {
        beams.push({
          position: [cx, y, z],
          scale: [span, 1, 1],
        })
      }
      palletStops.push({
        position: [cx, y + 0.06, backZ - aisleSign * 0.02],
      })
      if (bay === 0 || bay === bayCount - 1 || bay % 3 === 0) {
        connectors.push({
          position: [x0 + Math.sign(x1 - x0) * 0.055, y + 0.028, aisleZ + aisleSign * 0.02],
        })
      }
    }
  }

  return {
    uprights,
    basePlates,
    beams,
    depthBeams,
    diagonals,
    palletStops,
    connectors,
    aisleZ,
    backZ,
    rackH,
    xs,
  }
}

/** Local pallet + cargo parts for one lane. Shared by PalletLoad and instanced occupancy. */
export function buildPalletLaneXforms(
  variant: PalletCargoVariant,
  maxHeight: number,
): {
  stringers: RackPartXform[]
  slats: RackPartXform[]
  boxes: RackPartXform[]
  palette: 0 | 1 | 2
} {
  const palletW = 1.2 * variant.widthScale
  const palletD = 0.8 * variant.depthScale
  const palletH = 0.145
  const cargoH = Math.min(
    0.62 * variant.heightScale,
    Math.max(0.28, maxHeight - palletH - 0.12),
  )
  const stringers: RackPartXform[] = [-palletW * 0.42, 0, palletW * 0.42].map(
    (x) => ({
      position: [x, palletH * 0.38, 0],
      scale: [1, 1, palletD],
    }),
  )
  const slats: RackPartXform[] = []
  const span = palletD - 0.08
  for (let i = 0; i < 5; i += 1) {
    slats.push({
      position: [0, palletH - 0.01, -span / 2 + (i / 4) * span],
      scale: [palletW, 1, 1],
    })
  }
  const w = palletW * 0.92
  const d = palletD * 0.9
  let boxes: RackPartXform[]
  if (variant.boxCount === 2) {
    boxes = [
      {
        position: [-w * 0.26, palletH + cargoH / 2, 0],
        scale: [w * 0.46, cargoH, d],
      },
      {
        position: [w * 0.26, palletH + (cargoH * 0.88) / 2, 0],
        scale: [w * 0.46, cargoH * 0.88, d * 0.92],
      },
    ]
  } else if (variant.boxCount === 4) {
    boxes = [
      {
        position: [-w * 0.25, palletH + (cargoH * 0.7) / 2, -d * 0.22],
        scale: [w * 0.46, cargoH * 0.7, d * 0.44],
      },
      {
        position: [w * 0.25, palletH + (cargoH * 0.64) / 2, -d * 0.22],
        scale: [w * 0.44, cargoH * 0.64, d * 0.44],
      },
      {
        position: [-w * 0.25, palletH + (cargoH * 0.72) / 2, d * 0.22],
        scale: [w * 0.46, cargoH * 0.72, d * 0.42],
      },
      {
        position: [w * 0.25, palletH + (cargoH * 0.58) / 2, d * 0.22],
        scale: [w * 0.44, cargoH * 0.58, d * 0.42],
      },
    ]
  } else {
    boxes = [
      {
        position: [-w * 0.25, palletH + (cargoH * 0.55) / 2, 0],
        scale: [w * 0.46, cargoH * 0.55, d * 0.94],
      },
      {
        position: [w * 0.25, palletH + (cargoH * 0.55) / 2, 0],
        scale: [w * 0.46, cargoH * 0.55, d * 0.9],
      },
      {
        position: [0, palletH + cargoH * 0.55 + (cargoH * 0.38) / 2, 0],
        scale: [w * 0.7, cargoH * 0.38, d * 0.62],
      },
    ]
  }
  return { stringers, slats, boxes, palette: variant.palette }
}

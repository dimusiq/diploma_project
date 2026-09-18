import { describe, expect, it } from "vitest"
import {
  buildSelectiveRackParts,
  palletCargoVariant,
  uprightLocalXs,
} from "@/components/warehouse3d/palletRackLayout.ts"

describe("palletRackLayout", () => {
  it("places bay uprights from layout length, not hardcoded world coords", () => {
    const xs = uprightLocalXs(48, 12)
    expect(xs).toHaveLength(13)
    expect(xs[0]).toBeCloseTo(-24)
    expect(xs[12]).toBeCloseTo(24)
    expect(xs[1]! - xs[0]!).toBeCloseTo(4)
  })

  it("keeps structural parts inside the rack footprint", () => {
    const parts = buildSelectiveRackParts({
      rackLength: 48,
      rackDepth: 2.4,
      bayCount: 12,
      levels: 3,
      levelHeight: 1.35,
      aisleSign: -1,
    })
    expect(parts.uprights).toHaveLength(26)
    expect(parts.beams.length).toBe(12 * 4 * 2)
    const zs = [
      ...parts.uprights,
      ...parts.beams,
      ...parts.depthBeams,
      ...parts.diagonals,
    ].map((p) => p.position[2])
    const maxAbsZ = Math.max(...zs.map((z) => Math.abs(z)))
    expect(maxAbsZ).toBeLessThanOrEqual(2.4 / 2)
  })

  it("builds independent A/B faces without opening a mid-block aisle", () => {
    const a = buildSelectiveRackParts({
      rackLength: 48,
      rackDepth: 2.4,
      bayCount: 12,
      levels: 3,
      levelHeight: 1.35,
      aisleSign: -1,
    })
    const b = buildSelectiveRackParts({
      rackLength: 48,
      rackDepth: 2.4,
      bayCount: 12,
      levels: 3,
      levelHeight: 1.35,
      aisleSign: 1,
    })
    expect(a.aisleZ).toBeLessThan(0)
    expect(b.aisleZ).toBeGreaterThan(0)
    expect(a.backZ).toBeGreaterThan(0)
    expect(b.backZ).toBeLessThan(0)
    expect(Math.abs(a.backZ + b.backZ)).toBeLessThan(0.001)
  })

  it("returns a stable pallet cargo variant for a cell key", () => {
    const a = palletCargoVariant("0-1-4-0")
    const b = palletCargoVariant("0-1-4-0")
    const c = palletCargoVariant("1-1-4-0")
    expect(a).toEqual(b)
    expect(a.boxCount).toBeGreaterThanOrEqual(2)
    expect(a.boxCount).toBeLessThanOrEqual(4)
    expect(a).not.toEqual(c)
  })
})

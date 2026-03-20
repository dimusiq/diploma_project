import { Vector3 } from "three"

/** Равномерная параметризация полилинии: t ∈ [0, 1] — доля пройденной длины. */
export function samplePolyline3D(
  points: Vector3[],
  t: number,
): { position: Vector3; headingY: number } {
  if (points.length === 0) {
    return { position: new Vector3(), headingY: 0 }
  }
  if (points.length === 1) {
    return { position: points[0].clone(), headingY: 0 }
  }
  const segments: { a: Vector3; b: Vector3; len: number }[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const len = a.distanceTo(b)
    segments.push({ a, b, len })
    total += len
  }
  if (total < 1e-6) {
    return { position: points[0].clone(), headingY: 0 }
  }
  let d = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < segments.length; i++) {
    const { a, b, len } = segments[i]
    const last = i === segments.length - 1
    if (d <= len || last) {
      const u = len > 1e-6 ? Math.min(1, d / len) : 0
      const position = a.clone().lerp(b, u)
      const dx = b.x - a.x
      const dz = b.z - a.z
      const headingY = Math.atan2(dx, dz)
      return { position, headingY }
    }
    d -= len
  }
  const lastPt = points[points.length - 1]
  return { position: lastPt.clone(), headingY: 0 }
}

export function polylineLength(points: Vector3[]): number {
  let L = 0
  for (let i = 0; i < points.length - 1; i++) {
    L += points[i].distanceTo(points[i + 1])
  }
  return L
}

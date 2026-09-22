import {
  Box3,
  Frustum,
  Matrix4,
  type PerspectiveCamera,
  Ray,
  Vector3,
} from "three"

export const DETECTION_HZ = 5
export const CAMERA_VIEW_HZ = 24
export const CAMERA_VIEW_WIDTH = 640
export const CAMERA_VIEW_HEIGHT = 360
export const MAX_DETECT_DISTANCE = 16
export const MAX_RAY_CANDIDATES = 12

export const AGV_CAMERA_LOCAL = {
  position: [0, 1.7, 0.9] as const,
  rotationY: Math.PI,
}

export type Vec3 = { x: number; y: number; z: number }

export type SceneTarget = {
  id: string
  className: string
  entityType: string
  entityId: string
  position: Vec3
  half: Vec3
}

export type SceneOccluder = {
  id: string
  min: Vec3
  max: Vec3
}

export type ViewDetection = {
  id: string
  camera_id: string
  equipment_id: string
  class_name: string
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
  track_id: string
  severity: string
  entity_type: string
  entity_id: string
  world_position: Vec3
}

export type DetectMeta = {
  className: string
  entityType: string
  entityId: string
  half: Vec3
  center?: Vec3
}

const _proj = new Matrix4()
const _frustum = new Frustum()
const _box = new Box3()
const _ray = new Ray()
const _dir = new Vector3()
const _hit = new Vector3()
const _camPos = new Vector3()
const _forward = new Vector3()
const _corner = new Vector3()
const _projected = new Vector3()

function trackKey(className: string, trackId: string): string {
  return `${className}:${trackId}`
}

export function detectionKey(detection: ViewDetection): string {
  return trackKey(detection.class_name, detection.track_id)
}

export function cameraWorldFromAgv(agv: { x: number; y?: number; z: number; heading: number }): Vec3 & {
  heading: number
} {
  const [lx, ly, lz] = AGV_CAMERA_LOCAL.position
  const cos = Math.cos(agv.heading)
  const sin = Math.sin(agv.heading)
  return {
    x: agv.x + lx * cos + lz * sin,
    y: (agv.y ?? 0) + ly,
    z: agv.z - lx * sin + lz * cos,
    heading: agv.heading + AGV_CAMERA_LOCAL.rotationY,
  }
}

export function holdReason(detections: ViewDetection[]): "person" | "obstacle" | null {
  if (detections.some((item) => item.class_name === "person")) return "person"
  if (detections.some((item) => item.class_name === "obstacle")) return "obstacle"
  return null
}

export function diffDetections(prev: ViewDetection[], next: ViewDetection[]): {
  appeared: ViewDetection[]
  lost: ViewDetection[]
} {
  const prevBy = new Map(prev.map((item) => [detectionKey(item), item]))
  const nextBy = new Map(next.map((item) => [detectionKey(item), item]))
  const appeared: ViewDetection[] = []
  const lost: ViewDetection[] = []
  for (const [key, item] of nextBy) {
    if (!prevBy.has(key)) appeared.push(item)
  }
  for (const [key, item] of prevBy) {
    if (!nextBy.has(key)) lost.push(item)
  }
  return { appeared, lost }
}

export function stabilizeTracks(
  active: Map<string, ViewDetection>,
  missing: Map<string, number>,
  next: ViewDetection[],
  missesBeforeLost = 2,
): ViewDetection[] {
  const seen = new Set<string>()
  for (const item of next) {
    const key = detectionKey(item)
    seen.add(key)
    active.set(key, item)
    missing.delete(key)
  }
  for (const key of [...active.keys()]) {
    if (seen.has(key)) continue
    const count = (missing.get(key) ?? 0) + 1
    if (count >= missesBeforeLost) {
      active.delete(key)
      missing.delete(key)
    } else {
      missing.set(key, count)
    }
  }
  return [...active.values()]
}

function classRank(className: string): number {
  return className === "rack" ? 1 : 0
}

function containsPoint(box: SceneOccluder, point: Vec3): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  )
}

function isOccluded(
  origin: Vector3,
  target: SceneTarget,
  distance: number,
  occluders: SceneOccluder[],
): boolean {
  _dir.set(target.position.x - origin.x, target.position.y - origin.y, target.position.z - origin.z)
  if (_dir.lengthSq() < 1e-6) return false
  _dir.normalize()
  _ray.set(origin, _dir)
  for (const occluder of occluders) {
    if (occluder.id === target.id) continue
    if (containsPoint(occluder, target.position)) continue
    _box.min.set(occluder.min.x, occluder.min.y, occluder.min.z)
    _box.max.set(occluder.max.x, occluder.max.y, occluder.max.z)
    const hit = _ray.intersectBox(_box, _hit)
    if (!hit) continue
    if (hit.distanceTo(origin) + 0.2 < distance) return true
  }
  return false
}

function projectBBox(
  camera: PerspectiveCamera,
  target: SceneTarget,
  width: number,
  height: number,
): ViewDetection["bbox"] | null {
  const minX = target.position.x - target.half.x
  const maxX = target.position.x + target.half.x
  const minY = target.position.y - target.half.y
  const maxY = target.position.y + target.half.y
  const minZ = target.position.z - target.half.z
  const maxZ = target.position.z + target.half.z
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let visible = 0
  const xs = [minX, maxX]
  const ys = [minY, maxY]
  const zs = [minZ, maxZ]
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        _corner.set(x, y, z)
        const dx = x - _camPos.x
        const dy = y - _camPos.y
        const dz = z - _camPos.z
        if (dx * _forward.x + dy * _forward.y + dz * _forward.z <= 0) continue
        _projected.copy(_corner).project(camera)
        if (_projected.z < -1 || _projected.z > 1) continue
        const sx = (_projected.x * 0.5 + 0.5) * width
        const sy = (1 - (_projected.y * 0.5 + 0.5)) * height
        left = Math.min(left, sx)
        top = Math.min(top, sy)
        right = Math.max(right, sx)
        bottom = Math.max(bottom, sy)
        visible += 1
      }
    }
  }
  if (visible < 1) return null
  const x = Math.max(0, left)
  const y = Math.max(0, top)
  const boxWidth = Math.min(width, right) - x
  const boxHeight = Math.min(height, bottom) - y
  if (boxWidth < 2 || boxHeight < 2) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(boxWidth),
    height: Math.round(boxHeight),
  }
}

export function detectInView(args: {
  camera: PerspectiveCamera
  targets: SceneTarget[]
  occluders: SceneOccluder[]
  width: number
  height: number
  equipmentId: string
  maxDistance?: number
}): ViewDetection[] {
  const camera = args.camera
  camera.updateMatrixWorld()
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  _frustum.setFromProjectionMatrix(_proj)
  camera.getWorldPosition(_camPos)
  camera.getWorldDirection(_forward)
  const maxDistance = args.maxDistance ?? MAX_DETECT_DISTANCE
  const maxDistanceSq = maxDistance * maxDistance
  const candidates: Array<{ target: SceneTarget; distance: number }> = []

  for (const target of args.targets) {
    if (target.entityId === args.equipmentId) continue
    const dx = target.position.x - _camPos.x
    const dy = target.position.y - _camPos.y
    const dz = target.position.z - _camPos.z
    const distanceSq = dx * dx + dy * dy + dz * dz
    if (distanceSq > maxDistanceSq || distanceSq < 0.04) continue
    if (dx * _forward.x + dy * _forward.y + dz * _forward.z <= 0.15) continue
    _box.min.set(
      target.position.x - target.half.x,
      target.position.y - target.half.y,
      target.position.z - target.half.z,
    )
    _box.max.set(
      target.position.x + target.half.x,
      target.position.y + target.half.y,
      target.position.z + target.half.z,
    )
    if (!_frustum.intersectsBox(_box)) continue
    candidates.push({ target, distance: Math.sqrt(distanceSq) })
  }

  candidates.sort(
    (a, b) => classRank(a.target.className) - classRank(b.target.className) || a.distance - b.distance,
  )
  const limited = candidates.slice(0, MAX_RAY_CANDIDATES)
  const result: ViewDetection[] = []
  for (const { target, distance } of limited) {
    if (isOccluded(_camPos, target, distance, args.occluders)) continue
    const bbox = projectBBox(camera, target, args.width, args.height)
    if (!bbox) continue
    const distanceFactor = 1 - Math.min(distance / maxDistance, 1)
    const confidence = Math.round((0.62 + 0.35 * distanceFactor) * 100) / 100
    result.push({
      id: `${args.equipmentId}:${target.className}:${target.entityId}`,
      camera_id: `${args.equipmentId}-cam`,
      equipment_id: args.equipmentId,
      class_name: target.className,
      confidence,
      bbox,
      track_id: target.entityId,
      severity: target.className === "person" || target.className === "obstacle" ? "warning" : "info",
      entity_type: target.entityType,
      entity_id: target.entityId,
      world_position: {
        x: target.position.x,
        y: target.position.y,
        z: target.position.z,
      },
    })
  }
  return result
}

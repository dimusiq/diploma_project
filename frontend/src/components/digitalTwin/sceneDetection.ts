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
export const MAX_RAY_CANDIDATES = 12

export type VisibilityReason =
  | "VISIBLE"
  | "BEHIND_CAMERA"
  | "OUTSIDE_FRUSTUM"
  | "INSIDE_NEAR"
  | "BEYOND_FAR"
  | "OCCLUDED"
  | "INVALID_BBOX"

export type VisibilityReport = {
  reason: VisibilityReason
  className: string
  entityId: string
  world: Vec3
  cameraSpace: Vec3
  frustum: boolean
  occluded: boolean
  distance: number
  bbox: { x: number; y: number; width: number; height: number } | null
  projectedCenter: { x: number; y: number } | null
}

export type CameraDebugSnapshot = {
  position: Vec3
  rotation: Vec3
  forward: Vec3
  near: number
  far: number
  fov: number
  person: VisibilityReport | null
}

export const AGV_CAMERA_LOCAL = {
  position: [0, 1.7, 0.9] as const,
  rotationY: Math.PI,
}

export type Vec3 = { x: number; y: number; z: number }

/** Роль объекта в сцене. От неё зависит, попадает ли он в детекцию камеры. */
export type SceneRole =
  | "storage_content"
  | "storage_structure"
  | "floor_object"
  | "dynamic_entity"

export type SceneTarget = {
  id: string
  className: string
  entityType: string
  entityId: string
  position: Vec3
  half: Vec3
  objectUuid?: string
  sceneRole?: SceneRole
}

export type SceneOccluder = {
  id: string
  min: Vec3
  max: Vec3
  /** Equipment that owns this volume. The camera AGV must not occlude itself. */
  ownerId?: string
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
  object_uuid?: string
}

export type DetectMeta = {
  className: string
  entityType: string
  entityId: string
  half: Vec3
  center?: Vec3
  sceneRole?: SceneRole
}

export function detectionSkipReason(
  target: Pick<SceneTarget, "sceneRole">,
): "STORAGE_CONTENT" | "STORAGE_STRUCTURE" | null {
  if (target.sceneRole === "storage_content") return "STORAGE_CONTENT"
  if (target.sceneRole === "storage_structure") return "STORAGE_STRUCTURE"
  return null
}

/** Содержимое и каркас стеллажа видны и закрывают обзор, но не детектируются. */
export function isDetectionCandidate(target: Pick<SceneTarget, "sceneRole">): boolean {
  return detectionSkipReason(target) === null
}

export function selectDetectionCandidates(
  targets: SceneTarget[],
  debug = false,
): SceneTarget[] {
  const kept: SceneTarget[] = []
  for (const target of targets) {
    const skip = detectionSkipReason(target)
    if (skip) {
      if (debug) {
        console.info(
          `class=${target.className}\nsceneRole=${target.sceneRole}\ndetectable=false\nreason=${skip}`,
        )
      }
      continue
    }
    if (debug && target.className === "pallet") {
      console.info(
        `class=pallet\nsceneRole=${target.sceneRole ?? "floor_object"}\ndetectable=true`,
      )
    }
    kept.push(target)
  }
  return kept
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
const _local = new Vector3()
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

const OCCLUSION_EPSILON = 0.45
const _sample = new Vector3()

function sampleBlocked(
  origin: Vector3,
  sample: Vec3,
  occluders: SceneOccluder[],
  ownerId: string | undefined,
): boolean {
  _sample.set(sample.x, sample.y, sample.z)
  const distance = _sample.distanceTo(origin)
  if (distance < 1e-4) return false
  _dir.copy(_sample).sub(origin).multiplyScalar(1 / distance)
  _ray.set(origin, _dir)
  for (const occluder of occluders) {
    if (ownerId && (occluder.ownerId === ownerId || occluder.id === ownerId)) continue
    if (containsPoint(occluder, { x: origin.x, y: origin.y, z: origin.z })) continue
    if (containsPoint(occluder, sample)) continue
    _box.min.set(occluder.min.x, occluder.min.y, occluder.min.z)
    _box.max.set(occluder.max.x, occluder.max.y, occluder.max.z)
    const hit = _ray.intersectBox(_box, _hit)
    if (!hit) continue
    if (hit.distanceTo(origin) + OCCLUSION_EPSILON < distance) return true
  }
  return false
}

function isOccluded(
  origin: Vector3,
  target: SceneTarget,
  occluders: SceneOccluder[],
  ownerId?: string,
): boolean {
  const samples: Vec3[] = [
    target.position,
    {
      x: target.position.x + target.half.x * 0.65,
      y: target.position.y,
      z: target.position.z,
    },
    {
      x: target.position.x - target.half.x * 0.65,
      y: target.position.y,
      z: target.position.z,
    },
  ]
  let blocked = 0
  for (const sample of samples) {
    if (sampleBlocked(origin, sample, occluders, ownerId)) blocked += 1
  }
  return blocked >= 2
}

function finite(value: number): boolean {
  return Number.isFinite(value)
}

export function clampDetectionBox(
  box: { x: number; y: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
): ViewDetection["bbox"] | null {
  if (
    !finite(box.x) ||
    !finite(box.y) ||
    !finite(box.width) ||
    !finite(box.height) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null
  }
  const x = Math.min(Math.max(box.x, 0), viewportWidth)
  const y = Math.min(Math.max(box.y, 0), viewportHeight)
  const right = Math.min(Math.max(box.x + box.width, 0), viewportWidth)
  const bottom = Math.min(Math.max(box.y + box.height, 0), viewportHeight)
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

export function placeDetectionLabel(
  box: { x: number; y: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
  labelWidth: number,
  labelHeight: number,
): { x: number; y: number } {
  const width = Math.min(labelWidth, viewportWidth)
  const height = Math.min(labelHeight, viewportHeight)
  let x = box.x
  let y = box.y - height
  if (box.y < height) y = box.y + box.height
  if (y + height > viewportHeight) y = box.y - height
  if (x + width > viewportWidth) x = viewportWidth - width
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (y + height > viewportHeight) y = Math.max(0, viewportHeight - height)
  return { x, y }
}

type DepthSample = {
  minZ: number
  maxZ: number
  center: Vec3
}

function measureDepth(camera: PerspectiveCamera, target: SceneTarget): DepthSample {
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        _local.set(
          target.position.x + sx * target.half.x,
          target.position.y + sy * target.half.y,
          target.position.z + sz * target.half.z,
        )
        camera.worldToLocal(_local)
        if (_local.z < minZ) minZ = _local.z
        if (_local.z > maxZ) maxZ = _local.z
      }
    }
  }
  _local.set(target.position.x, target.position.y, target.position.z)
  camera.worldToLocal(_local)
  return {
    minZ,
    maxZ,
    center: { x: _local.x, y: _local.y, z: _local.z },
  }
}

function projectBBox(
  camera: PerspectiveCamera,
  target: SceneTarget,
  width: number,
  height: number,
  near: number,
  far: number,
): ViewDetection["bbox"] | null {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let visible = 0
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = target.position.x + sx * target.half.x
        const y = target.position.y + sy * target.half.y
        const z = target.position.z + sz * target.half.z
        _local.set(x, y, z)
        camera.worldToLocal(_local)
        if (_local.z > -near || _local.z < -far) continue
        _corner.set(x, y, z)
        _projected.copy(_corner).project(camera)
        if (!finite(_projected.x) || !finite(_projected.y) || !finite(_projected.z)) continue
        if (_projected.z < -1 || _projected.z > 1) continue
        const sxPx = (_projected.x * 0.5 + 0.5) * width
        const syPx = (1 - (_projected.y * 0.5 + 0.5)) * height
        if (!finite(sxPx) || !finite(syPx)) continue
        left = Math.min(left, sxPx)
        top = Math.min(top, syPx)
        right = Math.max(right, sxPx)
        bottom = Math.max(bottom, syPx)
        visible += 1
      }
    }
  }
  if (visible < 1) return null
  return clampDetectionBox(
    { x: left, y: top, width: right - left, height: bottom - top },
    width,
    height,
  )
}

function worldBox(target: SceneTarget): void {
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
}

function projectedCenter(
  camera: PerspectiveCamera,
  target: SceneTarget,
  width: number,
  height: number,
  near: number,
): { x: number; y: number } | null {
  _local.set(target.position.x, target.position.y, target.position.z)
  camera.worldToLocal(_local)
  if (_local.z > -near) return null
  _projected.set(target.position.x, target.position.y, target.position.z).project(camera)
  if (!finite(_projected.x) || !finite(_projected.y)) return null
  return {
    x: Math.round((_projected.x * 0.5 + 0.5) * width),
    y: Math.round((1 - (_projected.y * 0.5 + 0.5)) * height),
  }
}

export function explainTarget(
  camera: PerspectiveCamera,
  target: SceneTarget,
  occluders: SceneOccluder[],
  width: number,
  height: number,
  ownerId?: string,
): VisibilityReport {
  camera.updateWorldMatrix(true, false)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  _frustum.setFromProjectionMatrix(_proj)
  camera.getWorldPosition(_camPos)
  const depth = measureDepth(camera, target)
  const distance = Math.hypot(
    target.position.x - _camPos.x,
    target.position.y - _camPos.y,
    target.position.z - _camPos.z,
  )
  const near = camera.near
  const far = camera.far
  const report: VisibilityReport = {
    reason: "VISIBLE",
    className: target.className,
    entityId: target.entityId,
    world: { x: target.position.x, y: target.position.y, z: target.position.z },
    cameraSpace: depth.center,
    frustum: false,
    occluded: false,
    distance,
    bbox: null,
    projectedCenter: projectedCenter(camera, target, width, height, near),
  }
  if (depth.minZ >= 0) {
    report.reason = "BEHIND_CAMERA"
    return report
  }
  if (depth.minZ > -near) {
    report.reason = "INSIDE_NEAR"
    return report
  }
  if (depth.maxZ < -far) {
    report.reason = "BEYOND_FAR"
    return report
  }
  worldBox(target)
  report.frustum = _frustum.intersectsBox(_box)
  if (!report.frustum) {
    report.reason = "OUTSIDE_FRUSTUM"
    return report
  }
  report.occluded = isOccluded(_camPos, target, occluders, ownerId)
  if (report.occluded) {
    report.reason = "OCCLUDED"
    return report
  }
  report.bbox = projectBBox(camera, target, width, height, near, far)
  if (!report.bbox) {
    report.reason = "INVALID_BBOX"
    return report
  }
  return report
}

export function formatPersonDebug(snapshot: CameraDebugSnapshot): string {
  const person = snapshot.person
  if (!person) return "[SmartCameraDebug] person=(none)"
  const fmt = (value: Vec3) =>
    `(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)})`
  const box = person.bbox
    ? `(${person.bbox.x}, ${person.bbox.y}, ${person.bbox.width}x${person.bbox.height})`
    : "none"
  const center = person.projectedCenter
    ? `(${person.projectedCenter.x}, ${person.projectedCenter.y})`
    : "none"
  const verdict = person.reason === "VISIBLE" ? "VISIBLE" : `REJECT: ${person.reason}`
  return [
    "[SmartCameraDebug]",
    `person=${person.entityId}`,
    `world=${fmt(person.world)}`,
    `camera=${fmt(snapshot.position)}`,
    `forward=${fmt(snapshot.forward)}`,
    `cameraSpace=${fmt(person.cameraSpace)}`,
    `distance=${person.distance.toFixed(2)}`,
    `depth=${person.cameraSpace.z.toFixed(2)}`,
    `frustum=${person.frustum}`,
    `occluded=${person.occluded}`,
    `projectedCenter=${center}`,
    `bbox=${box}`,
    verdict,
  ].join("\n")
}

export function detectInView(args: {
  camera: PerspectiveCamera
  targets: SceneTarget[]
  occluders: SceneOccluder[]
  width: number
  height: number
  equipmentId: string
  debug?: CameraDebugSnapshot
}): ViewDetection[] {
  const camera = args.camera
  camera.updateWorldMatrix(true, false)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  _frustum.setFromProjectionMatrix(_proj)
  camera.getWorldPosition(_camPos)
  camera.getWorldDirection(_forward)
  if (args.debug) {
    args.debug.position = { x: _camPos.x, y: _camPos.y, z: _camPos.z }
    args.debug.rotation = {
      x: camera.rotation.x,
      y: camera.rotation.y,
      z: camera.rotation.z,
    }
    args.debug.forward = { x: _forward.x, y: _forward.y, z: _forward.z }
    args.debug.near = camera.near
    args.debug.far = camera.far
    args.debug.fov = camera.fov
    args.debug.person = null
  }
  const near = camera.near
  const far = Math.max(camera.far, near)
  const targets = selectDetectionCandidates(args.targets, Boolean(args.debug))
  const protectedCandidates: Array<{ target: SceneTarget; distance: number }> = []
  const rest: Array<{ target: SceneTarget; distance: number }> = []

  const notePerson = (target: SceneTarget) => {
    if (!args.debug || target.className !== "person") return
    const report = explainTarget(
      camera,
      target,
      args.occluders,
      args.width,
      args.height,
      args.equipmentId,
    )
    const current = args.debug.person
    const nextInFront = report.cameraSpace.z < 0
    const currentInFront = current ? current.cameraSpace.z < 0 : false
    const closer =
      current === null ||
      (nextInFront !== currentInFront
        ? nextInFront
        : report.distance < current.distance)
    if (closer) args.debug.person = report
  }

  for (const target of targets) {
    if (target.entityId === args.equipmentId) continue
    const dx = target.position.x - _camPos.x
    const dy = target.position.y - _camPos.y
    const dz = target.position.z - _camPos.z
    const distance = Math.hypot(dx, dy, dz)
    const reach = Math.hypot(target.half.x, target.half.y, target.half.z)
    if (distance - reach > far) {
      notePerson(target)
      continue
    }
    const depth = measureDepth(camera, target)
    if (depth.minZ >= 0 || depth.minZ > -near || depth.maxZ < -far) {
      notePerson(target)
      continue
    }
    worldBox(target)
    if (!_frustum.intersectsBox(_box)) {
      notePerson(target)
      continue
    }
    const slot = { target, distance }
    if (target.className === "person" || target.className === "obstacle") {
      protectedCandidates.push(slot)
    } else {
      rest.push(slot)
    }
  }

  rest.sort(
    (a, b) => classRank(a.target.className) - classRank(b.target.className) || a.distance - b.distance,
  )
  const limited = [...protectedCandidates, ...rest.slice(0, MAX_RAY_CANDIDATES)]
  const result: ViewDetection[] = []
  for (const { target, distance } of limited) {
    const occluded = isOccluded(_camPos, target, args.occluders, args.equipmentId)
    if (occluded) {
      notePerson(target)
      continue
    }
    const bbox = projectBBox(camera, target, args.width, args.height, near, far)
    if (!bbox) {
      notePerson(target)
      continue
    }
    const distanceFactor = 1 - Math.min(distance / far, 1)
    const confidence = Math.round((0.62 + 0.35 * distanceFactor) * 100) / 100
    const detection: ViewDetection = {
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
      object_uuid: target.objectUuid,
    }
    result.push(detection)
    notePerson(target)
  }
  return result
}

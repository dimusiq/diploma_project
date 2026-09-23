import type { PerspectiveCamera } from "three"
import { controlCamera } from "@/api/smartCamera.ts"
import {
  CAMERA_VIEW_HEIGHT,
  CAMERA_VIEW_WIDTH,
  type CameraDebugSnapshot,
  type DetectMeta,
  detectionKey,
  diffDetections,
  type SceneOccluder,
  type SceneTarget,
  type ViewDetection,
} from "@/components/digitalTwin/sceneDetection.ts"

type Listener = () => void

const cameras = new Map<string, PerspectiveCamera>()
const detectionListeners = new Set<Listener>()
const frustumListeners = new Set<Listener>()
const focusListeners = new Set<Listener>()
const openListeners = new Set<Listener>()
const debugListeners = new Set<Listener>()

let detections: ViewDetection[] = []
let log: Array<{ timestamp: string; class_name: string; confidence: number; track_id: string }> = []
let showFrustum = false
let viewActive = false
let canvas: HTMLCanvasElement | null = null
let pallets: SceneTarget[] = []
let occluders: SceneOccluder[] = []
let focus: ViewDetection["world_position"] | null = null
let openRequested = false
let cameraDebug: CameraDebugSnapshot | null = null
const posted = new Map<string, "seen" | "lost">()

export function registerAgvCamera(equipmentId: string, camera: PerspectiveCamera | null): void {
  if (camera) cameras.set(equipmentId, camera)
  else cameras.delete(equipmentId)
}

export function getAgvCamera(equipmentId: string): PerspectiveCamera | undefined {
  return cameras.get(equipmentId)
}

export function bindCameraCanvas(node: HTMLCanvasElement | null): void {
  canvas = node
}

export function getCameraCanvas(): HTMLCanvasElement | null {
  return canvas
}

export function setCameraViewActive(active: boolean): void {
  viewActive = active
}

export function cameraViewActive(): boolean {
  return viewActive
}

export function getSceneDetections(): ViewDetection[] {
  return detections
}

export function getDetectionLog() {
  return log
}

export function subscribeSceneDetections(listener: Listener): () => void {
  detectionListeners.add(listener)
  return () => detectionListeners.delete(listener)
}

export function publishSceneDetections(next: ViewDetection[]): void {
  const prev = detections
  const changed =
    prev.length !== next.length ||
    next.some((item, index) => {
      const other = prev[index]
      return (
        !other ||
        detectionKey(other) !== detectionKey(item) ||
        other.bbox.x !== item.bbox.x ||
        other.bbox.y !== item.bbox.y ||
        other.bbox.width !== item.bbox.width ||
        other.bbox.height !== item.bbox.height
      )
    })
  if (!changed) return
  const transition = diffDetections(prev, next)
  if (cameraDebugEnabled()) {
    for (const item of transition.appeared) {
      if (item.class_name !== "person") continue
      console.info(
        `[PERSON TRACE] stage=STORE_ADD entityId=${item.entity_id} objectUuid=${item.object_uuid ?? ""} trackId=${item.track_id} source=scene-detection`,
      )
    }
    for (const item of transition.lost) {
      if (item.class_name !== "person") continue
      console.info(
        `[PERSON TRACE] stage=STORE_REMOVE entityId=${item.entity_id} objectUuid=${item.object_uuid ?? ""} trackId=${item.track_id} source=scene-detection`,
      )
    }
  }
  if (transition.appeared.length > 0 || transition.lost.length > 0) {
    const stamp = new Date().toISOString()
    const lines = [
      ...transition.appeared.map((item) => ({
        timestamp: stamp,
        class_name: item.class_name,
        confidence: item.confidence,
        track_id: item.track_id,
      })),
      ...transition.lost.map((item) => ({
        timestamp: stamp,
        class_name: item.class_name,
        confidence: item.confidence,
        track_id: item.track_id,
      })),
    ]
    log = [...log, ...lines].slice(-12)
  }
  detections = next
  for (const listener of detectionListeners) listener()
}

export function postDetectionTransitions(
  equipmentId: string,
  prev: ViewDetection[],
  next: ViewDetection[],
): void {
  const { appeared, lost } = diffDetections(prev, next)
  for (const item of appeared) {
    const key = detectionKey(item)
    if (posted.get(key) === "seen") continue
    posted.set(key, "seen")
    void controlCamera(equipmentId, "seen", undefined, item.class_name, item.track_id).catch(() => {
      posted.delete(key)
    })
  }
  for (const item of lost) {
    const key = detectionKey(item)
    if (posted.get(key) === "lost") continue
    posted.set(key, "lost")
    void controlCamera(equipmentId, "lost", undefined, item.class_name, item.track_id).catch(() => {
      posted.delete(key)
    })
  }
}

export function setSceneFixtures(next: { pallets: SceneTarget[]; occluders: SceneOccluder[] }): void {
  pallets = next.pallets
  occluders = next.occluders
}

export function getPalletTargets(): SceneTarget[] {
  return pallets
}

export function getRackOccluders(): SceneOccluder[] {
  return occluders
}

export function readDetectMeta(userData: { detect?: DetectMeta }): DetectMeta | null {
  const meta = userData.detect
  if (!meta?.className || !meta.entityId) return null
  return meta
}

export function getShowCameraFrustum(): boolean {
  return showFrustum
}

export function setShowCameraFrustum(next: boolean): void {
  if (showFrustum === next) return
  showFrustum = next
  for (const listener of frustumListeners) listener()
}

export function subscribeCameraFrustum(listener: Listener): () => void {
  frustumListeners.add(listener)
  return () => frustumListeners.delete(listener)
}

export function requestFocusDetection(position: ViewDetection["world_position"]): void {
  focus = position
  for (const listener of focusListeners) listener()
}

export function consumeFocusDetection(): ViewDetection["world_position"] | null {
  const current = focus
  focus = null
  return current
}

export function subscribeFocusDetection(listener: Listener): () => void {
  focusListeners.add(listener)
  return () => focusListeners.delete(listener)
}

export function cameraDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("cameraDebug") === "1"
}

export function getCameraDebug(): CameraDebugSnapshot | null {
  return cameraDebug
}

export function publishCameraDebug(next: CameraDebugSnapshot): void {
  cameraDebug = next
  for (const listener of debugListeners) listener()
}

export function subscribeCameraDebug(listener: Listener): () => void {
  debugListeners.add(listener)
  return () => debugListeners.delete(listener)
}

export function requestOpenSmartCamera(): void {
  openRequested = true
  for (const listener of openListeners) listener()
}

export function consumeOpenSmartCamera(): boolean {
  const current = openRequested
  openRequested = false
  return current
}

export function subscribeOpenSmartCamera(listener: Listener): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

export const CAMERA_VIEW_SIZE = {
  width: CAMERA_VIEW_WIDTH,
  height: CAMERA_VIEW_HEIGHT,
}

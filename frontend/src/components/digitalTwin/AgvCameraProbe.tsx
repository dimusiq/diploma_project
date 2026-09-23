import { useFrame, useThree } from "@react-three/fiber"
import { useRef } from "react"
import {
  Box3,
  Color,
  type Object3D,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import {
  cameraDebugEnabled,
  cameraViewActive,
  getAgvCamera,
  publishCameraDebug,
  getCameraCanvas,
  getPalletTargets,
  getRackOccluders,
  postDetectionTransitions,
  publishSceneDetections,
  readDetectMeta,
} from "@/components/digitalTwin/agvCameraBridge.ts"
import {
  CAMERA_VIEW_HEIGHT,
  CAMERA_VIEW_HZ,
  CAMERA_VIEW_WIDTH,
  type CameraDebugSnapshot,
  DETECTION_HZ,
  type DetectMeta,
  detectInView,
  formatPersonDebug,
  isDetectionCandidate,
  type SceneTarget,
  stabilizeTracks,
  type ViewDetection,
} from "@/components/digitalTwin/sceneDetection.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"

const EQUIPMENT_ID = "agv-1"
const target = new WebGLRenderTarget(CAMERA_VIEW_WIDTH, CAMERA_VIEW_HEIGHT)
const pixels = new Uint8Array(CAMERA_VIEW_WIDTH * CAMERA_VIEW_HEIGHT * 4)
const savedClear = new Color()
const viewClear = new Color("#1c1917")
const worldPoint = new Vector3()
const localCenter = new Vector3()
const bounds = new Box3()
const boundsSize = new Vector3()

function paintViewport(gl: WebGLRenderer, scene: Object3D, camera: Object3D) {
  const canvas = getCameraCanvas()
  if (!canvas) return
  const prevTarget = gl.getRenderTarget()
  gl.getClearColor(savedClear)
  const prevAlpha = gl.getClearAlpha()
  const prevAuto = gl.autoClear
  gl.setRenderTarget(target)
  gl.setClearColor(viewClear, 1)
  gl.clear(true, true, true)
  gl.render(scene, camera as never)
  gl.readRenderTargetPixels(target, 0, 0, CAMERA_VIEW_WIDTH, CAMERA_VIEW_HEIGHT, pixels)
  gl.setRenderTarget(prevTarget)
  gl.setClearColor(savedClear, prevAlpha)
  gl.autoClear = prevAuto
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const image = ctx.createImageData(CAMERA_VIEW_WIDTH, CAMERA_VIEW_HEIGHT)
  const row = CAMERA_VIEW_WIDTH * 4
  for (let y = 0; y < CAMERA_VIEW_HEIGHT; y += 1) {
    const src = (CAMERA_VIEW_HEIGHT - 1 - y) * row
    image.data.set(pixels.subarray(src, src + row), y * row)
  }
  ctx.putImageData(image, 0, 0)
}

function collectTargets(scene: Object3D): SceneTarget[] {
  const targets: SceneTarget[] = []
  scene.traverse((object) => {
    if (object.userData.cameraDebug) return
    const meta = readDetectMeta(object.userData as { detect?: DetectMeta })
    if (!meta || !isDetectionCandidate(meta)) return
    object.updateWorldMatrix(true, false)
    bounds.setFromObject(object)
    let half = meta.half
    if (bounds.isEmpty()) {
      localCenter.set(meta.center?.x ?? 0, meta.center?.y ?? 0, meta.center?.z ?? 0)
      object.localToWorld(localCenter)
      worldPoint.copy(localCenter)
    } else {
      bounds.getCenter(worldPoint)
      bounds.getSize(boundsSize)
      half = { x: boundsSize.x / 2, y: boundsSize.y / 2, z: boundsSize.z / 2 }
    }
    targets.push({
      id: `${meta.entityType}:${meta.entityId}`,
      className: meta.className,
      entityType: meta.entityType,
      entityId: meta.entityId,
      position: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
      half,
      objectUuid: object.uuid,
      sceneRole: meta.sceneRole,
    })
  })
  for (const pallet of getPalletTargets()) {
    if (!isDetectionCandidate(pallet)) continue
    targets.push(pallet)
  }
  return targets
}

export function AgvCameraProbe() {
  const { gl, scene } = useThree()
  const viewAcc = useRef(0)
  const detectAcc = useRef(0)
  const active = useRef(new Map<string, ViewDetection>())
  const missing = useRef(new Map<string, number>())
  const published = useRef<ViewDetection[]>([])
  const wasOnline = useRef(false)

  useFrame((_, dt) => {
    const camera = getAgvCamera(EQUIPMENT_ID)
    if (!camera) return
    camera.updateMatrixWorld()
    viewAcc.current += dt
    if (cameraViewActive() && viewAcc.current >= 1 / CAMERA_VIEW_HZ) {
      viewAcc.current = 0
      paintViewport(gl, scene, camera)
    }
    detectAcc.current += dt
    if (detectAcc.current < 1 / DETECTION_HZ) return
    detectAcc.current = 0
    camera.parent?.updateWorldMatrix(true, false)
    camera.updateMatrixWorld(true)
    const debug: CameraDebugSnapshot | undefined = cameraDebugEnabled()
      ? {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: 0 },
          near: camera.near,
          far: camera.far,
          fov: camera.fov,
          person: null,
        }
      : undefined
    const targets = collectTargets(scene)
    if (debug) {
      const seen = new Map<string, string[]>()
      for (const target of targets) {
        if (target.className !== "person" || !target.objectUuid) continue
        const uuids = seen.get(target.entityId) ?? []
        uuids.push(target.objectUuid)
        seen.set(target.entityId, uuids)
      }
      for (const [entityId, uuids] of seen) {
        if (uuids.length < 2) continue
        console.info(
          `[PERSON TRACE] stage=DUPLICATE entityId=${entityId} objectUuid=${uuids.join(",")} source=scene-traverse`,
        )
      }
    }
    const next = detectInView({
      camera,
      targets,
      occluders: getRackOccluders(),
      width: CAMERA_VIEW_WIDTH,
      height: CAMERA_VIEW_HEIGHT,
      equipmentId: EQUIPMENT_ID,
      debug,
    })
    if (debug) {
      publishCameraDebug(debug)
      console.info(formatPersonDebug(debug))
    }
    const stable = stabilizeTracks(active.current, missing.current, next, 2)
    const prev = published.current
    published.current = stable
    publishSceneDetections(stable)
    const online = deviceSimulation
      .getDataSnapshot()
      .devices.some((device) => device.id === EQUIPMENT_ID && device.camera?.online)
    if (online) {
      postDetectionTransitions(EQUIPMENT_ID, wasOnline.current ? prev : [], stable)
    }
    wasOnline.current = online
  })

  return null
}

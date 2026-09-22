import { useFrame, useThree } from "@react-three/fiber"
import { useRef } from "react"
import {
  Color,
  type Object3D,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import {
  cameraViewActive,
  getAgvCamera,
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
  DETECTION_HZ,
  type DetectMeta,
  detectInView,
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
    const meta = readDetectMeta(object.userData as { detect?: DetectMeta })
    if (!meta) return
    object.updateWorldMatrix(true, false)
    localCenter.set(meta.center?.x ?? 0, meta.center?.y ?? 0, meta.center?.z ?? 0)
    object.localToWorld(localCenter)
    worldPoint.copy(localCenter)
    targets.push({
      id: `${meta.entityType}:${meta.entityId}`,
      className: meta.className,
      entityType: meta.entityType,
      entityId: meta.entityId,
      position: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
      half: meta.half,
    })
  })
  for (const pallet of getPalletTargets()) targets.push(pallet)
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
    const next = detectInView({
      camera,
      targets: collectTargets(scene),
      occluders: getRackOccluders(),
      width: CAMERA_VIEW_WIDTH,
      height: CAMERA_VIEW_HEIGHT,
      equipmentId: EQUIPMENT_ID,
    })
    const stable = stabilizeTracks(active.current, missing.current, next)
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

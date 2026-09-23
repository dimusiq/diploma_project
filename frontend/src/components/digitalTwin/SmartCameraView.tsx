import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import {
  useCameraControl,
  type CameraDetection,
} from "@/api/smartCamera.ts"
import type { SimCameraState } from "@/components/deviceServer/simTypes.ts"
import {
  bindCameraCanvas,
  consumeOpenSmartCamera,
  getCameraDebug,
  getDetectionLog,
  getSceneDetections,
  requestFocusDetection,
  subscribeCameraDebug,
  setCameraViewActive,
  subscribeOpenSmartCamera,
  subscribeSceneDetections,
} from "@/components/digitalTwin/agvCameraBridge.ts"
import {
  CAMERA_VIEW_HEIGHT,
  CAMERA_VIEW_HZ,
  CAMERA_VIEW_WIDTH,
  clampDetectionBox,
  placeDetectionLabel,
} from "@/components/digitalTwin/sceneDetection.ts"
import { requestAgvCameraView } from "@/components/digitalTwin/twinCameraFollow.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { useSimMotion } from "@/components/deviceServer/useDeviceSimulation.ts"
import { describeDetection } from "@/lib/personnel.ts"
import { getCameraStatusLabel } from "@/lib/statusLabels.ts"
import { cn } from "@/lib/utils.ts"

const FRAME_WIDTH = CAMERA_VIEW_WIDTH
const FRAME_HEIGHT = CAMERA_VIEW_HEIGHT
const LABEL_WIDTH = 132
const LABEL_HEIGHT = 32
const HISTORY_PREVIEW = 3

const VIEWPORT_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  minHeight: 180,
  aspectRatio: "16 / 9",
  overflow: "hidden",
}

const OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
}

type Availability = "live" | "offline" | "disabled"

type BoxDetection = CameraDetection & {
  world_position?: { x: number; y: number; z: number }
}

function useLiveDetections() {
  const detections = useSyncExternalStore(subscribeSceneDetections, getSceneDetections, getSceneDetections)
  const log = useSyncExternalStore(subscribeSceneDetections, getDetectionLog, getDetectionLog)
  return { detections, log }
}

function modelLabel(model: string, sceneViewport: boolean): string {
  if (sceneViewport || model === "scene-camera" || model === "yolo-demo") return "Scene camera"
  return model || "Scene camera"
}

function tone(className: string): string {
  if (className === "person") return "border-sky-400 text-sky-50"
  if (className === "obstacle") return "border-red-500 text-red-50"
  if (className === "pallet" || className === "box") return "border-emerald-400 text-emerald-50"
  return "border-amber-400 text-amber-50"
}

function clock(timestamp: string | undefined): string {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp.slice(11, 19) || timestamp
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function cameraAvailability(camera: SimCameraState | null | undefined, equipmentOnline: boolean): Availability {
  if (camera?.enabled === false) return "disabled"
  if (!equipmentOnline) return "offline"
  return "live"
}

export function SmartCameraView({
  name,
  online,
  availability,
  model,
  fps,
  detections,
  log = [],
  description,
  imageSrc,
  sceneViewport = false,
  obstacle,
  held,
  onShowInWorld,
  onFocus,
}: {
  name: string
  online: boolean
  availability?: Availability
  model: string
  fps: number
  detections: BoxDetection[]
  sceneViewport?: boolean
  log?: Array<Pick<CameraDetection, "timestamp" | "class_name" | "confidence" | "track_id">>
  description: string
  imageSrc?: string | null
  obstacle: boolean
  held?: boolean
  onShowInWorld?: () => void
  onFocus?: (position: { x: number; y: number; z: number }) => void
}) {
  const live = useLiveDetections()
  const peopleMotion = useSimMotion().workers ?? []
  const debug = useSyncExternalStore(subscribeCameraDebug, getCameraDebug, getCameraDebug)
  const [showAll, setShowAll] = useState(false)
  const [stamp, setStamp] = useState(() => new Date().toISOString().slice(0, 19).replace("T", " "))
  useEffect(() => {
    if (!sceneViewport) return
    setCameraViewActive(true)
    const timer = window.setInterval(() => {
      setStamp(new Date().toISOString().slice(0, 19).replace("T", " "))
    }, 1000)
    return () => {
      setCameraViewActive(false)
      window.clearInterval(timer)
    }
  }, [sceneViewport])
  const state = availability ?? (online ? "live" : "offline")
  const liveView = state === "live"
  const shown = liveView ? (sceneViewport ? live.detections : detections) : []
  const rows = (sceneViewport && live.log.length > 0 ? live.log : log.length > 0 ? log : shown).map((item) => ({
    timestamp: "timestamp" in item ? item.timestamp : "",
    class_name: item.class_name,
    confidence: item.confidence,
    track_id: item.track_id,
  }))
  const visibleRows = showAll ? rows : rows.slice(-HISTORY_PREVIEW)
  const shownFps = !liveView ? 0 : fps > 0 ? fps : sceneViewport ? CAMERA_VIEW_HZ : 0
  const people = shown.filter((item) => item.class_name === "person").length
  const pallets = shown.filter((item) => item.class_name === "pallet").length
  const personHit = shown.some((item) => item.class_name === "person")

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden text-stone-100">
      <header className="pr-8">
        <p className="text-[11px] tracking-[0.14em] text-stone-400">SMART CAMERA</p>
        <h2 className="font-heading text-lg font-semibold text-stone-50">{name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs">
          {state === "disabled" ? (
            <span className="text-stone-400">○ DISABLED</span>
          ) : liveView ? (
            <>
              <span className="text-emerald-400">● ONLINE</span>
              <span className="text-emerald-300">● LIVE</span>
              <span>{shownFps} FPS</span>
            </>
          ) : (
            <span className="text-stone-400">○ OFFLINE</span>
          )}
        </p>
      </header>

      <div
        data-testid="camera-viewport"
        className="w-full rounded-md bg-stone-950 ring-1 ring-stone-700"
        style={VIEWPORT_STYLE}
      >
        {sceneViewport ? (
          <canvas
            ref={bindCameraCanvas}
            width={FRAME_WIDTH}
            height={FRAME_HEIGHT}
            data-testid="agv-camera-viewport"
            className="h-full w-full"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        ) : imageSrc ? (
          <img
            alt=""
            src={imageSrc}
            className="h-full w-full object-cover"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        ) : (
          <div className="bg-stone-900" style={{ position: "absolute", inset: 0 }} />
        )}
        <div data-testid="camera-overlay" style={OVERLAY_STYLE}>
          {liveView && sceneViewport ? (
            <>
              <div className="absolute top-2 left-2 font-mono text-[10px] leading-tight text-white/90">
                <div>CAM-{name}</div>
                <div className="text-red-400">● REC</div>
                <div>{stamp}</div>
                <div>{shownFps.toFixed(1)} FPS</div>
              </div>
              <div className="absolute top-2 right-2 bg-black/70 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                LIVE
              </div>
            </>
          ) : null}
          {liveView
            ? shown.map((item) => {
                if (!item.bbox) return null
                const box = clampDetectionBox(item.bbox, FRAME_WIDTH, FRAME_HEIGHT)
                if (!box) return null
                const label = placeDetectionLabel(box, FRAME_WIDTH, FRAME_HEIGHT, LABEL_WIDTH, LABEL_HEIGHT)
                return (
                  <Fragment key={item.id}>
                    <div
                      data-testid="detection-box"
                      className={cn("border-2", tone(item.class_name))}
                      style={{
                        position: "absolute",
                        boxSizing: "border-box",
                        left: `${(box.x / FRAME_WIDTH) * 100}%`,
                        top: `${(box.y / FRAME_HEIGHT) * 100}%`,
                        width: `${(box.width / FRAME_WIDTH) * 100}%`,
                        height: `${(box.height / FRAME_HEIGHT) * 100}%`,
                      }}
                    />
                    <button
                      type="button"
                      data-testid="focus-object"
                      className="max-w-[40%] overflow-hidden bg-black/80 px-1 text-left font-mono text-[10px] text-ellipsis whitespace-nowrap"
                      style={{
                        position: "absolute",
                        left: `${(label.x / FRAME_WIDTH) * 100}%`,
                        top: `${(label.y / FRAME_HEIGHT) * 100}%`,
                        pointerEvents: "auto",
                      }}
                      onClick={() => item.world_position && onFocus?.(item.world_position)}
                    >
                      {(() => {
                        const caption = describeDetection(item, peopleMotion)
                        return caption.detail ? `${caption.primary} ${caption.detail}` : caption.primary
                      })()}
                    </button>
                  </Fragment>
                )
              })
            : (
              <div
                className="flex items-center justify-center text-sm text-stone-200"
                style={{ position: "absolute", inset: 0 }}
              >
                {state === "disabled" ? "Камера отключена" : getCameraStatusLabel("offline")}
              </div>
            )}
          {liveView && personHit ? (
            <div
              className="bg-sky-950/90 px-2 py-1 font-mono text-[11px] text-sky-100"
              style={{ position: "absolute", top: 28, right: 8 }}
            >
              PERSON DETECTED
            </div>
          ) : null}
          {liveView && obstacle ? (
            <div
              className="bg-red-950/90 px-2 py-1 font-mono text-[11px] text-red-100"
              style={{ position: "absolute", right: 8, bottom: 8, left: 8 }}
            >
              ⚠ ОБЪЕКТ НА ТРАЕКТОРИИ
            </div>
          ) : null}
          {debug ? (
            <pre
              data-testid="camera-debug"
              className="m-0 max-w-full overflow-hidden font-mono text-[9px] leading-tight text-lime-200"
              style={{ position: "absolute", right: 4, bottom: 28, left: 4 }}
            >
              {`CAM ${debug.position.x.toFixed(1)} ${debug.position.y.toFixed(1)} ${debug.position.z.toFixed(1)} fwd ${debug.forward.x.toFixed(2)} ${debug.forward.y.toFixed(2)} ${debug.forward.z.toFixed(2)} near ${debug.near} far ${debug.far} fov ${debug.fov.toFixed(0)}`}
              {debug.person
                ? `\n${debug.person.className} world ${debug.person.world.x.toFixed(1)} ${debug.person.world.y.toFixed(1)} ${debug.person.world.z.toFixed(1)} cam ${debug.person.cameraSpace.x.toFixed(2)} ${debug.person.cameraSpace.y.toFixed(2)} ${debug.person.cameraSpace.z.toFixed(2)} ${debug.person.reason} frustum ${debug.person.frustum} occluded ${debug.person.occluded}`
                : ""}
            </pre>
          ) : null}
        </div>
      </div>

      {liveView && (personHit || obstacle) ? (
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          {personHit ? <span className="text-sky-200">PERSON DETECTED</span> : null}
          {obstacle ? <span className="text-red-200">⚠ ОБЪЕКТ НА ТРАЕКТОРИИ</span> : null}
          {held ? <span className="text-red-100">AGV остановлен</span> : null}
        </div>
      ) : null}

      <dl
        data-testid="camera-telemetry"
        className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-stone-300 sm:grid-cols-6"
      >
        <div>
          <dt className="text-stone-500">CAMERA</dt>
          <dd>{modelLabel(model, sceneViewport)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">STATUS</dt>
          <dd>{state === "live" ? "LIVE" : state === "disabled" ? "DISABLED" : "OFFLINE"}</dd>
        </div>
        <div>
          <dt className="text-stone-500">OBJECTS</dt>
          <dd>{shown.length}</dd>
        </div>
        <div>
          <dt className="text-stone-500">PEOPLE</dt>
          <dd>{people}</dd>
        </div>
        <div>
          <dt className="text-stone-500">PALLETS</dt>
          <dd>{pallets}</dd>
        </div>
        <div>
          <dt className="text-stone-500">FPS</dt>
          <dd>{shownFps}</dd>
        </div>
      </dl>

      <section data-testid="detection-list" className="min-w-0 max-h-28 overflow-y-auto">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-stone-400">
          <p>DETECTIONS · {shown.length}</p>
          {rows.length > HISTORY_PREVIEW ? (
            <button type="button" className="text-stone-300 underline-offset-2 hover:underline" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Свернуть" : "Показать все"}
            </button>
          ) : null}
        </div>
        <ul className="space-y-0.5 font-mono text-[11px] text-stone-300">
          {visibleRows.length === 0 ? <li>{liveView ? description || "нет объектов" : "Камера не передаёт кадр"}</li> : null}
          {visibleRows.map((item, index) => (
            <li key={`${item.timestamp}-${item.class_name}-${item.track_id}-${index}`}>
              {clock(item.timestamp)}{" "}
              {(() => {
                const caption = describeDetection(item, peopleMotion)
                return caption.detail ? `${caption.primary} ${caption.detail}` : caption.primary
              })()}
            </li>
          ))}
        </ul>
      </section>

      {onShowInWorld ? (
        <div>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-stone-400" onClick={onShowInWorld}>
            Открыть в Digital Twin
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function CameraEquipmentSection({
  equipmentId,
  name,
  camera,
  held,
  canControl,
  equipmentOnline = true,
  onShowInWorld,
}: {
  equipmentId: string
  name: string
  camera?: SimCameraState | null
  held?: boolean
  canControl: boolean
  equipmentOnline?: boolean
  onShowInWorld?: (equipmentId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const installed = Boolean(camera?.installed)
  const control = useCameraControl(equipmentId)
  const availability = cameraAvailability(camera, equipmentOnline)
  const armed = useRef(false)
  const detections = camera?.detections ?? []
  useEffect(() => {
    if (consumeOpenSmartCamera()) setOpen(true)
    return subscribeOpenSmartCamera(() => setOpen(true))
  }, [])
  useEffect(() => {
    if (!installed || availability !== "live" || camera?.online || !canControl || armed.current) return
    armed.current = true
    control.mutate("start")
  }, [availability, camera?.online, canControl, control, installed])

  if (!installed) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Smart Camera</h3>
        <p className="text-sm text-muted-foreground">Камера не установлена</p>
      </section>
    )
  }

  const showInWorld = () => {
    requestAgvCameraView(equipmentId)
    onShowInWorld?.(equipmentId)
  }
  const shownFps = availability === "live" ? camera?.fps || CAMERA_VIEW_HZ : 0

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Smart Camera</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>Статус</div>
        <div>
          {availability === "disabled"
            ? "Отключена"
            : availability === "live"
              ? getCameraStatusLabel("online")
              : getCameraStatusLabel("offline")}
        </div>
        <div>Режим</div>
        <div>{availability === "live" ? "LIVE" : availability === "disabled" ? "DISABLED" : "OFFLINE"}</div>
        <div>Модель</div>
        <div>{modelLabel(camera?.model || "", true)}</div>
        <div>FPS</div>
        <div>{shownFps}</div>
        <div>Обнаружения</div>
        <div>{camera?.detection_count ?? detections.length}</div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          📷 Smart Camera
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={showInWorld}>
          Открыть в Digital Twin
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="smart-camera-dialog"
          className="max-h-[calc(100vh-48px)] w-[min(1200px,calc(100vw-48px))] max-w-[min(1200px,calc(100vw-48px))] overflow-y-auto border-stone-700 bg-stone-950 text-stone-100 sm:max-w-[min(1200px,calc(100vw-48px))]"
        >
          <DialogTitle className="sr-only">Smart Camera {name}</DialogTitle>
          <SmartCameraView
            name={name}
            online={availability === "live"}
            availability={availability}
            model={camera?.model || "scene-camera"}
            fps={shownFps}
            detections={detections}
            log={camera?.log}
            description={camera?.description || ""}
            sceneViewport
            obstacle={Boolean(camera?.obstacle)}
            onFocus={requestFocusDetection}
            held={held}
            onShowInWorld={showInWorld}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}

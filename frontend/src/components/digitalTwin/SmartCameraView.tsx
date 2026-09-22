import { useEffect, useState, useSyncExternalStore } from "react"
import {
  useCameraControl,
  type CameraDetection,
} from "@/api/smartCamera.ts"
import type { SimCameraState } from "@/components/deviceServer/simTypes.ts"
import {
  bindCameraCanvas,
  consumeOpenSmartCamera,
  getDetectionLog,
  getSceneDetections,
  requestFocusDetection,
  setCameraViewActive,
  subscribeOpenSmartCamera,
  subscribeSceneDetections,
} from "@/components/digitalTwin/agvCameraBridge.ts"
import { CAMERA_VIEW_HEIGHT, CAMERA_VIEW_WIDTH } from "@/components/digitalTwin/sceneDetection.ts"
import { requestAgvCameraView } from "@/components/digitalTwin/twinCameraFollow.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { getCameraStatusLabel } from "@/lib/statusLabels.ts"
import { cn } from "@/lib/utils.ts"

const FRAME_WIDTH = CAMERA_VIEW_WIDTH
const FRAME_HEIGHT = CAMERA_VIEW_HEIGHT

type BoxDetection = CameraDetection & {
  world_position?: { x: number; y: number; z: number }
}

function useLiveDetections() {
  const detections = useSyncExternalStore(subscribeSceneDetections, getSceneDetections, getSceneDetections)
  const log = useSyncExternalStore(subscribeSceneDetections, getDetectionLog, getDetectionLog)
  return { detections, log }
}

function modelLabel(model: string, source: string): string {
  if (source === "scene" || model === "scene-camera") return "Scene camera"
  if (model === "yolo-demo") return "Demo Detector"
  return model
}

function tone(className: string): string {
  if (className === "person") return "border-sky-400 text-sky-50"
  if (className === "obstacle") return "border-red-500 text-red-50"
  if (className === "pallet" || className === "box") return "border-emerald-400 text-emerald-50"
  return "border-amber-400 text-amber-50"
}

function cameraMode(online: boolean, source: string): "LIVE" | "DEMO" | "OFFLINE" {
  if (!online) return "OFFLINE"
  if (source === "live" || source === "scene") return "LIVE"
  return "DEMO"
}

function clock(timestamp: string | undefined): string {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp.slice(11, 19) || timestamp
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function SmartCameraView({
  name,
  online,
  model,
  fps,
  threshold = 0.5,
  source = "demo",
  detections,
  log = [],
  description,
  imageSrc,
  sceneViewport = false,
  obstacle,
  held,
  canControl,
  pending,
  onClose,
  onStartDemo,
  onStop,
  onShowInWorld,
  onFocus,
}: {
  name: string
  online: boolean
  model: string
  fps: number
  threshold?: number
  source?: string
  detections: BoxDetection[]
  sceneViewport?: boolean
  log?: Array<Pick<CameraDetection, "timestamp" | "class_name" | "confidence" | "track_id">>
  description: string
  imageSrc?: string | null
  obstacle: boolean
  held?: boolean
  canControl?: boolean
  pending?: boolean
  onClose?: () => void
  onStartDemo?: () => void
  onStop?: () => void
  onShowInWorld?: () => void
  onFocus?: (position: { x: number; y: number; z: number }) => void
}) {
  const live = useLiveDetections()
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
  const shown = sceneViewport ? live.detections : detections
  const rows = (sceneViewport && live.log.length > 0 ? live.log : log.length > 0 ? log : shown)
    .slice(-8)
    .map((item) => ({
      timestamp: "timestamp" in item ? item.timestamp : "",
      class_name: item.class_name,
      confidence: item.confidence,
      track_id: item.track_id,
    }))
  const mode = cameraMode(online, source)
  const obstacleHit = shown.find((item) => item.class_name === "obstacle")
  const personHit = shown.find((item) => item.class_name === "person")
  const people = shown.filter((item) => item.class_name === "person").length
  const pallets = shown.filter((item) => item.class_name === "pallet").length

  return (
    <div className="flex flex-col gap-3 text-stone-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.14em] text-stone-400">SMART CAMERA</p>
          <h2 className="font-heading text-lg font-semibold text-stone-50">{name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs">
            <span className={online ? "text-emerald-400" : "text-stone-400"}>
              {online ? "● ONLINE" : "○ OFFLINE"}
            </span>
            <span>{mode === "DEMO" ? "● DEMO" : mode === "LIVE" ? "● LIVE" : "○ OFFLINE"}</span>
            <span>{online ? `${fps} FPS` : "0 FPS"}</span>
          </p>
        </div>
        {onClose ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div
          className="relative overflow-hidden rounded-md bg-stone-950 ring-1 ring-stone-700"
          style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}` }}
        >
          {sceneViewport ? (
            <canvas
              ref={bindCameraCanvas}
              width={FRAME_WIDTH}
              height={FRAME_HEIGHT}
              data-testid="agv-camera-viewport"
              className="absolute inset-0 h-full w-full"
            />
          ) : imageSrc ? (
            <img alt="" src={imageSrc} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-stone-900" />
          )}
          {online && sceneViewport ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-2 left-2 font-mono text-[10px] leading-tight text-white/90">
                <div>CAM-{name}</div>
                <div className="text-red-400">REC ●</div>
                <div>{stamp}</div>
                <div>{shown.length} OBJ</div>
              </div>
              <div className="absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 border border-white/35" />
              <div
                className="absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 4px)",
                }}
              />
            </div>
          ) : null}
          {online
            ? shown.map((item) =>
                item.bbox ? (
                <div
                  key={item.id}
                  data-testid="detection-box"
                  className={cn("absolute border-2", tone(item.class_name))}
                  style={{
                    left: `${(item.bbox.x / FRAME_WIDTH) * 100}%`,
                    top: `${(item.bbox.y / FRAME_HEIGHT) * 100}%`,
                    width: `${(item.bbox.width / FRAME_WIDTH) * 100}%`,
                    height: `${(item.bbox.height / FRAME_HEIGHT) * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    data-testid="focus-object"
                    className="absolute top-0 left-0 bg-black/80 px-1 text-left font-mono text-[10px] leading-tight"
                    onClick={() => item.world_position && onFocus?.(item.world_position)}
                  >
                    {item.class_name.toUpperCase()}
                    {item.track_id ? ` #${item.track_id}` : ""}
                    <br />
                    {item.confidence.toFixed(2)}
                  </button>
                </div>
                ) : null,
              )
            : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-200">
                {getCameraStatusLabel("offline")}
              </div>
            )}
          {online && personHit ? (
            <div className="absolute top-2 right-2 bg-sky-950/90 px-2 py-1 font-mono text-[11px] text-sky-100">
              PERSON DETECTED
            </div>
          ) : null}
          {online && obstacle ? (
            <div className="absolute right-2 bottom-2 left-2 bg-red-950/90 px-2 py-1 font-mono text-[11px] text-red-100">
              ⚠ ОБЪЕКТ НА ТРАЕКТОРИИ
            </div>
          ) : null}
        </div>

        <aside className="space-y-2 rounded-md bg-stone-900 p-3 text-xs text-stone-200">
          <p>Model: {modelLabel(model, source)}</p>
          <p>Threshold: {threshold.toFixed(2)}</p>
          <p>Objects: {online ? shown.length : 0}</p>
          <p>People: {online ? people : 0}</p>
          <p>Pallets: {online ? pallets : 0}</p>
          <p>{mode}</p>
        </aside>
      </div>

      <div>
        <p className="mb-1 text-xs text-stone-400">Detection log</p>
        <ul className="max-h-28 space-y-0.5 overflow-hidden font-mono text-[11px] text-stone-300">
          {rows.length === 0 ? <li>нет объектов</li> : null}
          {rows.map((item, index) => (
            <li key={`${item.timestamp}-${item.class_name}-${index}`}>
              {clock(item.timestamp)} {item.class_name.toUpperCase()}
              {item.track_id ? ` #${item.track_id}` : ""} {item.confidence.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm whitespace-pre-line text-stone-400">
        {online ? description || "Обнаружено:\nнет объектов" : "Камера не передаёт кадр"}
      </p>
      {online && shown.length === 0 ? <p className="text-sm text-stone-200">Нет препятствий</p> : null}
      {obstacle ? (
        <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          <p className="font-medium">⚠ OBSTACLE DETECTED</p>
          <p>Остановлено камерой</p>
          <p>Причина: препятствие</p>
          <p>Camera: {name}</p>
          <p>Confidence: {(obstacleHit?.confidence ?? 0).toFixed(2)}</p>
          {held ? <p>AGV STOPPED</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {onShowInWorld ? (
          <Button type="button" size="sm" variant="outline" onClick={onShowInWorld}>
            Показать камеру в 3D
          </Button>
        ) : null}
        {canControl ? (
          <>
            <Button type="button" size="sm" disabled={pending || online} onClick={onStartDemo}>
              Запустить демо
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || !online} onClick={onStop}>
              Остановить
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function CameraEquipmentSection({
  equipmentId,
  name,
  camera,
  held,
  canControl,
  onShowInWorld,
}: {
  equipmentId: string
  name: string
  camera?: SimCameraState | null
  held?: boolean
  canControl: boolean
  onShowInWorld?: (equipmentId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const installed = Boolean(camera?.installed)
  const control = useCameraControl(equipmentId)
  const detections = camera?.detections ?? []
  useEffect(() => {
    if (consumeOpenSmartCamera()) setOpen(true)
    return subscribeOpenSmartCamera(() => setOpen(true))
  }, [])

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

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Smart Camera</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>Статус</div>
        <div>{camera?.online ? getCameraStatusLabel("online") : getCameraStatusLabel("offline")}</div>
        <div>Режим</div>
        <div>{cameraMode(Boolean(camera?.online), camera?.source || "demo")}</div>
        <div>Модель</div>
        <div>{modelLabel(camera?.model || "", camera?.source || "demo")}</div>
        <div>FPS</div>
        <div>{camera?.online ? camera?.fps ?? 0 : 0}</div>
        <div>Обнаружения</div>
        <div>{camera?.detection_count ?? detections.length}</div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          📷 Smart Camera
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={showInWorld}>
          Показать камеру в 3D
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-stone-700 bg-stone-950 text-stone-100">
          <DialogTitle className="sr-only">Smart Camera {name}</DialogTitle>
          <SmartCameraView
            name={name}
            online={Boolean(camera?.online)}
            model={camera?.model || "yolo-demo"}
            fps={camera?.fps ?? 0}
            threshold={camera?.confidence_threshold ?? 0.5}
            source={camera?.source || "demo"}
            detections={camera?.online ? detections : []}
            log={camera?.log}
            description={camera?.description || ""}
            sceneViewport
            obstacle={Boolean(camera?.obstacle)}
            onFocus={requestFocusDetection}
            held={held}
            canControl={canControl}
            pending={control.isPending}
            onClose={() => setOpen(false)}
            onStartDemo={() => control.mutate("start")}
            onStop={() => control.mutate("stop")}
            onShowInWorld={showInWorld}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}

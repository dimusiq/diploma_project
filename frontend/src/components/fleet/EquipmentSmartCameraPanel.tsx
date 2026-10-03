/** Назначение умной камеры на единицу техники из карточки оборудования. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { ApiError } from "@/client/core/ApiError.ts"
import {
  assignDeviceSmartCamera,
  type AvailableSmartCamera,
  type FleetDevice,
  type FleetSmartCamera,
  fetchAvailableSmartCameras,
  fetchSimFleetDevice,
  replaceDeviceSmartCamera,
  SIM_FLEET_QUERY_KEY,
  unassignDeviceSmartCamera,
} from "@/api/simFleet.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { getCameraStatusLabel } from "@/lib/statusLabels.ts"
import { cn } from "@/lib/utils.ts"

function formatSignal(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message
  if (typeof error === "object" && error && "detail" in error) {
    return String((error as { detail: unknown }).detail)
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "online") return "default"
  if (status === "maintenance") return "secondary"
  return "outline"
}

const HOST_KINDS = new Set(["agv", "amr", "forklift"])

function CameraInventoryPanel({ device }: { device: FleetDevice }) {
  return (
    <section
      className="space-y-3 rounded-md border bg-muted/20 p-4"
      data-testid="equipment-smart-camera-panel"
      aria-label="Умная камера"
    >
      <h3 className="text-sm font-semibold tracking-tight">Умная камера</h3>
      {device.mounted_on ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Закреплена за</dt>
            <dd className="font-mono font-medium">{device.mounted_on.code}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Техника</dt>
            <dd>{device.mounted_on.name}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Не закреплена за техникой</p>
      )}
    </section>
  )
}

export function EquipmentSmartCameraPanel({
  device,
  canEdit,
  onDeviceChange,
}: {
  device: FleetDevice
  canEdit: boolean
  onDeviceChange?: (row: FleetDevice) => void
}) {
  const queryClient = useQueryClient()
  const [picking, setPicking] = useState(false)
  const [mode, setMode] = useState<"assign" | "replace">("assign")
  const [cameraId, setCameraId] = useState("")
  const [confirmUnassign, setConfirmUnassign] = useState(false)
  const isHost = HOST_KINDS.has(device.kind)
  const isCamera = device.kind === "smart_camera"

  const available = useQuery({
    queryKey: ["equipment", "smart-cameras", "available"],
    queryFn: () => fetchAvailableSmartCameras(),
    enabled: picking && isHost,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: ["equipment", "smart-cameras", "available"] })
  }

  const assign = useMutation({
    mutationFn: () =>
      mode === "replace"
        ? replaceDeviceSmartCamera(device.id, cameraId)
        : assignDeviceSmartCamera(device.id, cameraId),
    onSuccess: async (result) => {
      await invalidate()
      const next = await fetchSimFleetDevice(device.id)
      onDeviceChange?.(next)
      setPicking(false)
      setCameraId("")
      toast.success(
        mode === "replace"
          ? "Умная камера заменена"
          : `Камера ${result.smart_camera?.code ?? ""} назначена`,
      )
    },
    onError: (error) => toast.error(errorMessage(error, "Не удалось назначить камеру")),
  })

  const unassign = useMutation({
    mutationFn: () => unassignDeviceSmartCamera(device.id),
    onSuccess: async () => {
      await invalidate()
      onDeviceChange?.(await fetchSimFleetDevice(device.id))
      setConfirmUnassign(false)
      toast.success("Умная камера откреплена")
    },
    onError: (error) => toast.error(errorMessage(error, "Не удалось открепить камеру")),
  })

  if (isCamera) return <CameraInventoryPanel device={device} />
  if (!isHost) return null

  const camera: FleetSmartCamera | null | undefined = device.smart_camera
  const options: AvailableSmartCamera[] = available.data?.data ?? []

  const openPicker = (next: "assign" | "replace") => {
    setMode(next)
    setCameraId("")
    setPicking(true)
  }

  return (
    <section
      className="space-y-3 rounded-md border bg-muted/20 p-4"
      data-testid="equipment-smart-camera-panel"
      aria-label="Умная камера"
    >
      <h3 className="text-sm font-semibold tracking-tight">Умная камера</h3>

      {camera ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Умная камера</dt>
            <dd className="font-mono font-medium">{camera.code}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Статус</dt>
            <dd className="mt-0.5">
              <Badge variant={statusBadgeVariant(camera.status)}>
                {getCameraStatusLabel(camera.status === "online" ? "online" : "offline")}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Последний сигнал</dt>
            <dd>{formatSignal(camera.last_signal_at)}</dd>
          </div>
          {camera.fps != null ? (
            <div>
              <dt className="text-muted-foreground">FPS</dt>
              <dd>{camera.fps}</dd>
            </div>
          ) : null}
          {camera.detection_count != null ? (
            <div>
              <dt className="text-muted-foreground">Детекции</dt>
              <dd>{camera.detection_count}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Умная камера не назначена</p>
      )}

      {canEdit && !picking ? (
        <div className="flex flex-wrap gap-2">
          {camera ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => openPicker("replace")}>
                Заменить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmUnassign(true)}
              >
                Открепить
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => openPicker("assign")}>
              Назначить камеру
            </Button>
          )}
        </div>
      ) : null}

      {canEdit && picking ? (
        <div className="space-y-3 rounded-md border bg-background p-3" data-testid="smart-camera-picker">
          <p className="text-sm font-medium">Выберите умную камеру</p>
          {available.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : null}
          {available.isSuccess && options.length === 0 ? (
            <p className="text-sm text-muted-foreground">Свободных умных камер нет</p>
          ) : null}
          <ul className="max-h-48 space-y-1 overflow-y-auto" role="listbox" aria-label="Умная камера">
            {options.map((item) => {
              const selected = cameraId === item.device_id
              return (
                <li key={item.device_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full flex-col items-start rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => setCameraId(item.device_id)}
                  >
                    <span className="font-mono font-medium">{item.code}</span>
                    <span className="text-muted-foreground">
                      Умная камера ·{" "}
                      {getCameraStatusLabel(item.status === "online" ? "online" : "offline")}
                      {item.model ? ` · ${item.model}` : ""}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!cameraId || assign.isPending}
              onClick={() => assign.mutate()}
            >
              {mode === "replace" ? "Заменить" : "Назначить"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPicking(false)
                setCameraId("")
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmUnassign}
        onOpenChange={setConfirmUnassign}
        title="Открепить умную камеру?"
        description={`Камера ${camera?.code ?? ""} перестанет быть закреплена за этой техникой.`}
        confirmLabel="Открепить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={unassign.isPending}
        onConfirm={() => unassign.mutate()}
      />
    </section>
  )
}

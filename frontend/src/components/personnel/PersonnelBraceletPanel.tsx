import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { ApiError } from "@/client/core/ApiError.ts"
import {
  personnelApi,
  type AvailableBracelet,
} from "@/api/personnel.ts"
import { SIM_FLEET_QUERY_KEY } from "@/api/simFleet.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  braceletDeviceStatusLabel,
  zoneLabel,
  type PersonnelBracelet,
  type PersonnelRecord,
} from "@/lib/personnel.ts"
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

export function PersonnelBraceletPanel({
  employee,
  canEdit,
  onEmployeeChange,
}: {
  employee: PersonnelRecord
  canEdit: boolean
  onEmployeeChange?: (row: PersonnelRecord) => void
}) {
  const queryClient = useQueryClient()
  const [picking, setPicking] = useState(false)
  const [mode, setMode] = useState<"assign" | "replace">("assign")
  const [deviceId, setDeviceId] = useState("")
  const [confirmUnassign, setConfirmUnassign] = useState(false)

  const available = useQuery({
    queryKey: ["personnel", "bracelets", "available"],
    queryFn: () => personnelApi.availableBracelets(),
    enabled: picking,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["personnel"] })
    await queryClient.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: ["personnel", "bracelets", "available"] })
  }

  const assign = useMutation({
    mutationFn: () =>
      mode === "replace"
        ? personnelApi.replaceBracelet(employee.id, deviceId)
        : personnelApi.assignBracelet(employee.id, deviceId),
    onSuccess: async (row) => {
      await invalidate()
      onEmployeeChange?.(row)
      setPicking(false)
      setDeviceId("")
      toast.success(mode === "replace" ? "Браслет заменён" : "Браслет назначен")
    },
    onError: (error) => toast.error(errorMessage(error, "Не удалось назначить браслет")),
  })

  const unassign = useMutation({
    mutationFn: () => personnelApi.unassignBracelet(employee.id),
    onSuccess: async (row) => {
      await invalidate()
      onEmployeeChange?.(row)
      setConfirmUnassign(false)
      toast.success("Браслет снят")
    },
    onError: (error) => toast.error(errorMessage(error, "Не удалось снять браслет")),
  })

  const bracelet: PersonnelBracelet | null | undefined = employee.bracelet
  const options: AvailableBracelet[] = available.data?.data ?? []

  const openPicker = (next: "assign" | "replace") => {
    setMode(next)
    setDeviceId("")
    setPicking(true)
  }

  return (
    <section
      className="space-y-3 rounded-md border bg-muted/20 p-4"
      data-testid="personnel-bracelet-panel"
      aria-label="Браслет-радиомаяк"
    >
      <h3 className="text-sm font-semibold tracking-tight">Браслет-радиомаяк</h3>

      {bracelet ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Браслет</dt>
            <dd className="font-mono font-medium">{bracelet.code}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Тип</dt>
            <dd>Браслет-радиомаяк</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Статус устройства</dt>
            <dd className="mt-0.5">
              <Badge variant={statusBadgeVariant(bracelet.status)}>
                {braceletDeviceStatusLabel(bracelet.status)}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Последний сигнал</dt>
            <dd>{formatSignal(bracelet.last_signal_at)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Текущее местоположение</dt>
            <dd>
              {bracelet.location_label
                ? `${zoneLabel(bracelet.location_label)}${bracelet.location_stale ? " (устарело)" : ""}`
                : "—"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Браслет не назначен</p>
      )}

      {canEdit && !picking ? (
        <div className="flex flex-wrap gap-2">
          {bracelet ? (
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
                Снять браслет
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => openPicker("assign")}>
              Назначить браслет
            </Button>
          )}
        </div>
      ) : null}

      {canEdit && picking ? (
        <div className="space-y-3 rounded-md border bg-background p-3" data-testid="bracelet-picker">
          <p className="text-sm font-medium">
            {mode === "replace" ? "Выберите новый браслет" : "Выберите браслет"}
          </p>
          {available.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : null}
          {available.isSuccess && options.length === 0 ? (
            <p className="text-sm text-muted-foreground">Свободных браслетов нет</p>
          ) : null}
          <ul className="max-h-48 space-y-1 overflow-y-auto" role="listbox" aria-label="Браслет">
            {options.map((item) => {
              const selected = deviceId === item.device_id
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
                        : "border-border hover:bg-muted/50",
                    )}
                    onClick={() => setDeviceId(item.device_id)}
                  >
                    <span className="font-mono font-medium">{item.code}</span>
                    <span className="text-xs text-muted-foreground">Браслет-радиомаяк</span>
                    <span className="text-xs">{braceletDeviceStatusLabel(item.status)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPicking(false)
                setDeviceId("")
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!deviceId || assign.isPending}
              onClick={() => assign.mutate()}
            >
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmUnassign}
        onOpenChange={setConfirmUnassign}
        title="Снять браслет?"
        description={
          bracelet
            ? `Браслет ${bracelet.code} перестанет быть закреплён за сотрудником.`
            : "Браслет будет снят с сотрудника."
        }
        confirmLabel="Снять браслет"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={unassign.isPending}
        onConfirm={() => unassign.mutate()}
      />
    </section>
  )
}

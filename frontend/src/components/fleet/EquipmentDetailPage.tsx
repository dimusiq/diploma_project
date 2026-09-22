/** Карточка единицы оборудования склада (wsim_device). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Wrench } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import {
  archiveSimFleetDevice,
  createDeviceMaintenance,
  type DeviceMaintenanceCreate,
  FLEET_KINDS,
  fetchDeviceEvents,
  fetchDeviceMaintenance,
  fetchDeviceTasks,
  fetchSimFleet,
  fetchSimFleetDevice,
  patchDeviceMaintenance,
  patchSimFleetDevice,
  SIM_FLEET_QUERY_KEY,
} from "@/api/simFleet.ts"
import { type WorkOrderPublic, workOrdersApi } from "@/api/workOrders.ts"
import type { ApiError } from "@/client/index.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { deviceKindLabel } from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import type { DeviceKind } from "@/components/deviceServer/simTypes.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { CameraEquipmentSection } from "@/components/digitalTwin/SmartCameraView.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  CATEGORY_ICONS,
  categoryOf,
  EQUIPMENT_CATEGORIES,
} from "@/lib/equipmentCatalog.ts"
import {
  getDeviceStatusLabel,
  getPriorityLabel,
  getSimMaintenanceStatusLabel,
  getSimMaintenanceTypeLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
  getWorkOrderStatusLabel,
} from "@/lib/statusLabels.ts"
import { handleError } from "@/utils.ts"

function kindLabel(kind: string): string {
  return deviceKindLabel(kind as DeviceKind) || kind
}

function categoryLabel(category: string): string {
  return EQUIPMENT_CATEGORIES.find((item) => item.id === category)?.label ?? category
}

function workOrdersForDevice(
  orders: WorkOrderPublic[],
  device: { id: string; name: string; code: string },
): WorkOrderPublic[] {
  const name = device.name.trim().toLowerCase()
  const code = device.code.trim().toLowerCase()
  return orders.filter((order) => {
    if (order.equipment_id === device.id) return true
    const eq = (order.equipment_name ?? "").trim().toLowerCase()
    if (!eq) return false
    return (
      eq === name ||
      eq === code ||
      (code.length > 0 && eq.includes(code)) ||
      (name.length > 1 && eq.includes(name))
    )
  })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("ru-RU")
}

function formatSimClock(sec: number | null | undefined): string {
  if (sec == null) return "—"
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = Math.floor(sec % 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function EquipmentDetailPage({
  deviceId,
  canManage,
  onBack,
  onShowOnMap,
  onShowCameraInWorld,
  onShowEvents,
  onShowWorkOrders,
}: {
  deviceId: string
  canManage: boolean
  onBack: () => void
  onShowOnMap: (code: string) => void
  onShowCameraInWorld?: (code: string) => void
  onShowEvents?: (code: string) => void
  onShowWorkOrders?: () => void
}) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [editOpen, setEditOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmMaintenance, setConfirmMaintenance] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [zoneId, setZoneId] = useState("")
  const [toForm, setToForm] = useState<DeviceMaintenanceCreate>({
    type: "preventive",
    title: "",
    status: "planned",
    priority: "medium",
  })

  const catalogQuery = useQuery({
    queryKey: SIM_FLEET_QUERY_KEY,
    queryFn: () => fetchSimFleet(false),
  })
  const deviceQuery = useQuery({
    queryKey: [...SIM_FLEET_QUERY_KEY, deviceId],
    queryFn: () => fetchSimFleetDevice(deviceId),
  })
  const maintenanceQuery = useQuery({
    queryKey: [...SIM_FLEET_QUERY_KEY, deviceId, "maintenance"],
    queryFn: () => fetchDeviceMaintenance(deviceId),
  })
  const tasksQuery = useQuery({
    queryKey: [...SIM_FLEET_QUERY_KEY, deviceId, "tasks"],
    queryFn: () => fetchDeviceTasks(deviceId),
  })
  const eventsQuery = useQuery({
    queryKey: [...SIM_FLEET_QUERY_KEY, deviceId, "events"],
    queryFn: () => fetchDeviceEvents(deviceId),
  })
  const workOrdersQuery = useQuery({
    queryKey: ["work-orders", "device-card", deviceId],
    queryFn: () => workOrdersApi.list({ limit: 50 }),
    retry: false,
  })

  const device = deviceQuery.data
  const sim = useSimData()
  const live = sim.devices.find((item) => item.id === device?.code) ?? null

  useEffect(() => {
    deviceSimulation.autoStart()
  }, [])
  const summary = maintenanceQuery.data?.summary ?? device?.maintenance
  const records = maintenanceQuery.data?.data ?? []
  const Icon = CATEGORY_ICONS[categoryOf(device?.kind ?? "agv")] ?? CATEGORY_ICONS.other
  const zones = catalogQuery.data?.zones ?? []
  const types = catalogQuery.data?.types ?? FLEET_KINDS.map((item) => ({
    kind: item,
    category: categoryOf(item),
    label: kindLabel(item),
    fields: [],
    simulated: true,
    taskCapable: true,
  }))

  const currentTask = useMemo(() => {
    const taskId = device?.runtime.taskId
    if (!taskId) return null
    return tasksQuery.data?.data.find((task) => task.id === taskId) ?? null
  }, [device?.runtime.taskId, tasksQuery.data])

  const relatedWorkOrders = useMemo(() => {
    if (!device) return []
    return workOrdersForDevice(workOrdersQuery.data?.data ?? [], device)
  }, [device, workOrdersQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      patchSimFleetDevice(deviceId, {
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || null,
        kind: kind || undefined,
        enabled,
        configuration: { zoneId: zoneId || null },
      }),
    onSuccess: (row) => {
      if (row.deferredUntilRestart?.length) {
        showSuccessToast(
          "Изменение параметра вступит в силу после следующего запуска симуляции",
        )
      } else {
        showSuccessToast("Оборудование обновлено")
      }
      setEditOpen(false)
      void qc.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
    },
    onError: handleError,
  })

  const maintenanceMode = useMutation({
    mutationFn: (next: boolean) =>
      patchSimFleetDevice(deviceId, { inMaintenance: next }),
    onSuccess: (row) => {
      showSuccessToast(
        row.inMaintenance ? "Оборудование на обслуживании" : "Обслуживание снято",
      )
      setConfirmMaintenance(false)
      void qc.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
    },
    onError: (error: ApiError) => {
      setConfirmMaintenance(false)
      handleError(error)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => archiveSimFleetDevice(deviceId),
    onSuccess: () => {
      showSuccessToast("Оборудование архивировано")
      setConfirmArchive(false)
      void qc.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
      onBack()
    },
    onError: (error: ApiError) => {
      setConfirmArchive(false)
      handleError(error)
    },
  })

  const createTo = useMutation({
    mutationFn: () =>
      createDeviceMaintenance(deviceId, {
        ...toForm,
        title: toForm.title.trim(),
      }),
    onSuccess: () => {
      showSuccessToast("Запись ТО создана")
      setToOpen(false)
      setToForm({ type: "preventive", title: "", status: "planned", priority: "medium" })
      void qc.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
    },
    onError: handleError,
  })

  function openEdit() {
    if (!device) return
    setName(device.name)
    setCode(device.code)
    setDescription(device.description ?? "")
    setKind(device.kind)
    setEnabled(device.enabled)
    setZoneId(device.configuration.zoneId ?? "")
    setEditOpen(true)
  }

  function requestMaintenance() {
    if (device?.runtime.taskId) {
      showErrorToast(
        "Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
      )
      return
    }
    setConfirmMaintenance(true)
  }

  if (deviceQuery.isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-destructive">Не удалось загрузить оборудование</p>
        <Button variant="outline" className="mt-3" onClick={onBack}>
          К списку
        </Button>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
        Загрузка карточки…
      </div>
    )
  }

  const status = device.inMaintenance
    ? "maintenance"
    : (device.runtime.status ?? (device.enabled ? "offline" : "offline"))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
      <button
        type="button"
        className="mb-4 text-sm text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        ← Оборудование
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-1 size-8 text-muted-foreground" aria-hidden />
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {device.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Код: <span className="font-mono">{device.code}</span>
              {" · "}
              Тип: {kindLabel(device.kind)}
              {" · "}
              Категория: {categoryLabel(device.category)}
            </p>
            <p className="mt-2 text-sm">
              <span className="mr-1">●</span>
              {device.inMaintenance ? (
                <span className="inline-flex items-center gap-1">
                  <Wrench className="size-3.5" aria-hidden />
                  На обслуживании
                </span>
              ) : (
                getDeviceStatusLabel(status)
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button onClick={openEdit}>Редактировать</Button>
          ) : null}
          <Button variant="outline" onClick={() => onShowOnMap(device.code)}>
            Показать на карте
          </Button>
          {canManage ? (
            <>
              <Button variant="outline" onClick={() => setToOpen(true)}>
                Создать ТО
              </Button>
              <Button variant="outline" onClick={requestMaintenance}>
                {device.inMaintenance ? "Снять с обслуживания" : "На обслуживание"}
              </Button>
            </>
          ) : null}
          {canManage && !device.archived ? (
            <Button variant="outline" onClick={() => setConfirmArchive(true)}>
              Архивировать
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            История
          </Button>
          <FetchingIndicator
            active={
              deviceQuery.isFetching ||
              maintenanceQuery.isFetching ||
              tasksQuery.isFetching ||
              workOrdersQuery.isFetching
            }
          />
        </div>
      </div>

      <Section title="Основная информация">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Info label="Название" value={device.name} />
          <Info label="Код" value={device.code} mono />
          <Info label="Категория" value={categoryLabel(device.category)} />
          <Info label="Тип" value={kindLabel(device.kind)} />
          <Info label="Описание" value={device.description || "—"} />
          <Info
            label="Зона"
            value={
              zones.find((zone) => zone.id === device.configuration.zoneId)?.name ||
              device.configuration.zoneId ||
              "—"
            }
          />
          <Info label="Активно" value={device.enabled ? "Да" : "Нет"} />
          <Info label="Архивировано" value={device.archived ? "Да" : "Нет"} />
          <Info label="Создано" value={formatDate(device.created_at)} />
          <Info label="Изменено" value={formatDate(device.updated_at)} />
        </dl>
      </Section>

      <Section title="Текущее состояние">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Info label="Статус" value={getDeviceStatusLabel(status)} />
          <Info
            label="Онлайн"
            value={device.runtime.online ? "Да" : "Нет"}
          />
          <Info
            label="Текущая задача"
            value={currentTask ? `${getTaskTypeLabel(currentTask.kind)} ${currentTask.id}` : "Нет активной задачи"}
          />
          <Info
            label="Позиция"
            value={
              device.runtime.position
                ? `${device.runtime.position.x.toFixed(1)}, ${device.runtime.position.z.toFixed(1)}`
                : "—"
            }
          />
          {device.runtime.battery != null ? (
            <Info label="Заряд" value={`${Math.round(device.runtime.battery)}%`} />
          ) : null}
          {device.runtime.lastSeen != null ? (
            <Info label="Последний heartbeat" value={formatSimClock(device.runtime.lastSeen)} />
          ) : null}
          {device.runtime.lastEventAt != null ? (
            <Info label="Последняя телеметрия" value={formatSimClock(device.runtime.lastEventAt)} />
          ) : null}
          {device.runtime.busySec != null ? (
            <Info label="Время занятости" value={formatSimClock(device.runtime.busySec)} />
          ) : null}
          <Info
            label="В симуляции"
            value={device.runtime.inSimulation ? "Да" : "Нет"}
          />
        </dl>
      </Section>

      <Section title="Smart Camera">
        <CameraEquipmentSection
          equipmentId={live?.id ?? device.code}
          name={device.name}
          camera={live?.camera ?? device.runtime.camera ?? device.configuration.camera}
          held={live?.cameraHold}
          canControl={canManage}
          onShowInWorld={onShowCameraInWorld}
        />
      </Section>

      <Section title="Техническое обслуживание">
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Info label="Последнее ТО" value={formatDate(summary?.lastAt)} />
          <Info label="Следующее ТО" value={formatDate(summary?.nextAt)} />
          <Info
            label="Статус"
            value={summary?.status ? getSimMaintenanceStatusLabel(summary.status) : "—"}
          />
          <Info label="Всего обслуживаний" value={String(summary?.count ?? 0)} />
          <Info label="Просрочено" value={String(summary?.overdueCount ?? 0)} />
        </dl>
        <h3 className="mb-2 text-sm font-medium">История обслуживания</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Исполнитель</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.slice(0, 8).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.scheduled_at || row.created_at)}</TableCell>
                <TableCell>{row.title}</TableCell>
                <TableCell>{getSimMaintenanceTypeLabel(row.type)}</TableCell>
                <TableCell>{getSimMaintenanceStatusLabel(row.status)}</TableCell>
                <TableCell>{row.performed_by || "—"}</TableCell>
              </TableRow>
            ))}
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Записей ТО нет
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {records.length > 8 ? (
          <Button variant="outline" className="mt-2" onClick={() => setHistoryOpen(true)}>
            Показать все
          </Button>
        ) : null}
      </Section>

      <Section title="Последние наряды">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Наряд</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Приоритет</TableHead>
              <TableHead>Срок</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relatedWorkOrders.slice(0, 5).map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.title}</TableCell>
                <TableCell>{getWorkOrderStatusLabel(order.status)}</TableCell>
                <TableCell>{getPriorityLabel(order.priority)}</TableCell>
                <TableCell>{formatDate(order.due_at || order.end_at)}</TableCell>
              </TableRow>
            ))}
            {relatedWorkOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Нарядов по этому оборудованию нет
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {onShowWorkOrders ? (
          <Button variant="outline" className="mt-3" onClick={onShowWorkOrders}>
            Все наряды
          </Button>
        ) : null}
      </Section>

      <Section title="Последние события">
        <ul className="space-y-1 text-sm">
          {(eventsQuery.data?.data ?? []).slice(0, 8).map((event) => (
            <li key={event.id}>
              <span className="text-muted-foreground">
                {formatSimClock(event.at)} —{" "}
              </span>
              {event.message}
            </li>
          ))}
          {(eventsQuery.data?.data ?? []).length === 0 ? (
            <li className="text-muted-foreground">Событий нет</li>
          ) : null}
        </ul>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() =>
            onShowEvents ? onShowEvents(device.code) : setHistoryOpen(true)
          }
        >
          Показать все события
        </Button>
      </Section>

      <Section title="История задач">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Начало</TableHead>
              <TableHead>Окончание</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tasksQuery.data?.data ?? []).slice(-10).reverse().map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-mono text-xs">{task.id}</TableCell>
                <TableCell>{getTaskTypeLabel(task.kind)}</TableCell>
                <TableCell>{getTaskStatusLabel(task.status)}</TableCell>
                <TableCell>{formatSimClock(task.assignedAt ?? task.createdAt)}</TableCell>
                <TableCell>{formatSimClock(task.doneAt)}</TableCell>
              </TableRow>
            ))}
            {(tasksQuery.data?.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Заданий нет
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать оборудование</DialogTitle>
            <DialogDescription>
              Меняется конфигурация. Runtime-состояние симуляции напрямую не редактируется.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Код</Label>
              <Input
                value={code}
                className="font-mono"
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <FieldSelect
              label="Тип"
              value={kind || device.kind}
              onChange={setKind}
              options={types.map((item) => [item.kind, item.label] as [string, string])}
            />
            <p className="text-xs text-muted-foreground">
              Категория: {categoryLabel(categoryOf(kind || device.kind))}
            </p>
            <div className="grid gap-1.5">
              <Label>Описание</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <FieldSelect
              label="Зона"
              value={zoneId || "__none"}
              onChange={(value) => setZoneId(value === "__none" ? "" : value)}
              options={[
                ["__none", "Не задана"],
                ...zones.map((zone) => [zone.id, zone.name] as [string, string]),
              ]}
            />
            <FieldSelect
              label="Активно"
              value={enabled ? "yes" : "no"}
              onChange={(value) => setEnabled(value === "yes")}
              options={[
                ["yes", "Да"],
                ["no", "Нет"],
              ]}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={toOpen} onOpenChange={setToOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать ТО</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
            <FieldSelect
              label="Тип обслуживания"
              value={toForm.type}
              onChange={(type) => setToForm((prev) => ({ ...prev, type }))}
              options={[
                ["preventive", "Плановое ТО"],
                ["corrective", "Ремонт"],
                ["inspection", "Осмотр"],
                ["emergency", "Аварийное"],
              ]}
            />
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input
                aria-label="Название ТО"
                value={toForm.title}
                onChange={(event) =>
                  setToForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Описание</Label>
              <Textarea
                rows={2}
                value={toForm.description ?? ""}
                onChange={(event) =>
                  setToForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
            <FieldSelect
              label="Приоритет"
              value={toForm.priority ?? "medium"}
              onChange={(priority) => setToForm((prev) => ({ ...prev, priority }))}
              options={[
                ["low", "Низкий"],
                ["medium", "Средний"],
                ["high", "Высокий"],
                ["critical", "Критический"],
              ]}
            />
            <div className="grid gap-1.5">
              <Label>Дата/время</Label>
              <Input
                type="datetime-local"
                onChange={(event) =>
                  setToForm((prev) => ({
                    ...prev,
                    scheduled_at: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Исполнитель</Label>
              <Input
                value={toForm.performed_by ?? ""}
                onChange={(event) =>
                  setToForm((prev) => ({ ...prev, performed_by: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Примечание</Label>
              <Textarea
                rows={2}
                value={toForm.notes ?? ""}
                onChange={(event) =>
                  setToForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => createTo.mutate()}
              disabled={createTo.isPending || !toForm.title.trim()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>История</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            {records.map((row) => (
              <p key={row.id}>
                {formatDate(row.created_at)} · {getSimMaintenanceTypeLabel(row.type)} ·{" "}
                {getSimMaintenanceStatusLabel(row.status)}
                {canManage && row.status === "in_progress" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    onClick={() =>
                      patchDeviceMaintenance(deviceId, row.id, { status: "completed" }).then(
                        () => {
                          showSuccessToast("ТО завершено")
                          void qc.invalidateQueries({ queryKey: SIM_FLEET_QUERY_KEY })
                        },
                      )
                    }
                  >
                    Завершить
                  </Button>
                ) : null}
              </p>
            ))}
            {(eventsQuery.data?.data ?? []).map((event) => (
              <p key={event.id}>
                {formatSimClock(event.at)} · {event.message}
              </p>
            ))}
            {records.length === 0 && (eventsQuery.data?.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">Записей нет</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmMaintenance}
        onOpenChange={() => setConfirmMaintenance(false)}
        title={device.inMaintenance ? "Снять с обслуживания?" : "Перевести на обслуживание?"}
        description={
          device.inMaintenance
            ? "Устройство снова сможет получать новые задания симуляции."
            : "Новые задания симуляции назначаться не будут. Текущая задача не будет остановлена принудительно."
        }
        confirmLabel={device.inMaintenance ? "Снять" : "На обслуживание"}
        isLoading={maintenanceMode.isPending}
        onConfirm={() => maintenanceMode.mutate(!device.inMaintenance)}
      />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={() => setConfirmArchive(false)}
        title="Архивировать оборудование?"
        description="Устройство исчезнет из активного списка, история сохранится. На новые задания его нельзя будет назначить."
        confirmLabel="Архивировать"
        isLoading={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate()}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <CardContent className="px-4 py-4">
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

function Info({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value}</dd>
    </>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, text]) => (
            <SelectItem key={id} value={id}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Управление составом оборудования склада (конфигурация, не runtime). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useMemo, useState } from "react"
import { FaPlus } from "react-icons/fa"
import {
  archiveSimFleetDevice,
  createSimFleetDevice,
  type EquipmentCategoryMeta,
  type EquipmentTypeMeta,
  type EquipmentZoneMeta,
  type FleetCreate,
  type FleetDevice,
  fetchSimFleet,
  FLEET_KINDS,
  patchSimFleetDevice,
} from "@/api/simFleet.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { deviceKindLabel } from "@/components/deviceServer/simFormat.ts"
import type { DeviceKind } from "@/components/deviceServer/simTypes.ts"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  CATEGORY_COLUMNS,
  CATEGORY_ICONS,
  COLUMN_LABELS,
  EQUIPMENT_CATEGORIES,
  type EquipmentCategoryId,
  KIND_FIELDS,
  categoryOf,
} from "@/lib/equipmentCatalog.ts"
import {
  getDeviceStatusLabel,
  getSensorMetricLabel,
} from "@/lib/statusLabels.ts"
import { cn } from "@/lib/utils.ts"
import { handleError } from "@/utils.ts"

const QUERY_KEY = ["sim-fleet"] as const
const ALL = "all"
const ERROR = new Set(["fault", "jam", "error"])

type FormState = {
  name: string
  code: string
  kind: string
  description: string
  zoneId: string
  speed: string
  battery: string
  metricKind: string
  metricUnit: string
  metricMin: string
  metricMax: string
}

const emptyForm: FormState = {
  name: "",
  code: "",
  kind: "agv",
  description: "",
  zoneId: "",
  speed: "",
  battery: "",
  metricKind: "temperature",
  metricUnit: "°C",
  metricMin: "",
  metricMax: "",
}

function kindLabel(kind: string): string {
  return deviceKindLabel(kind as DeviceKind) || kind
}

function isOnline(device: FleetDevice): boolean {
  if (device.runtime.online != null) return device.runtime.online
  return device.enabled && device.runtime.status !== "offline"
}

function zoneName(
  zoneId: string | null | undefined,
  zones: EquipmentZoneMeta[],
): string {
  if (!zoneId) return "—"
  return zones.find((zone) => zone.id === zoneId)?.name ?? zoneId
}

export function FleetParkPage({ canManage = false }: { canManage?: boolean }) {
  const qc = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const [tab, setTab] = useState<EquipmentCategoryId>("all")
  const [kindFilter, setKindFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [zoneFilter, setZoneFilter] = useState(ALL)
  const [activeFilter, setActiveFilter] = useState(ALL)
  const [query, setQuery] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FleetDevice | null>(null)
  const [viewing, setViewing] = useState<FleetDevice | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [archiveTarget, setArchiveTarget] = useState<FleetDevice | null>(null)

  const fleetQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchSimFleet(false),
  })
  const devices = fleetQuery.data?.data ?? []
  const categories: EquipmentCategoryMeta[] =
    fleetQuery.data?.categories?.length
      ? fleetQuery.data.categories
      : EQUIPMENT_CATEGORIES.map((cat) => ({
          id: cat.id,
          label: cat.label,
          columns: CATEGORY_COLUMNS[cat.id],
        }))
  const types: EquipmentTypeMeta[] = fleetQuery.data?.types?.length
    ? fleetQuery.data.types
    : FLEET_KINDS.map((kind) => ({
        kind,
        category: categoryOf(kind),
        label: kindLabel(kind),
        fields: KIND_FIELDS[kind] ?? ["name", "code"],
        simulated: true,
        taskCapable: kind === "agv" || kind === "amr" || kind === "forklift",
      }))
  const zones = fleetQuery.data?.zones ?? []
  const sensorMetrics = fleetQuery.data?.sensorMetrics ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return devices.filter((device) => {
      const category = device.category || categoryOf(device.kind)
      if (tab !== "all" && category !== tab) return false
      if (kindFilter !== ALL && device.kind !== kindFilter) return false
      if (zoneFilter !== ALL && device.configuration.zoneId !== zoneFilter) {
        return false
      }
      const status = device.runtime.status ?? "offline"
      if (statusFilter !== ALL && status !== statusFilter) return false
      if (activeFilter === "on" && !device.enabled) return false
      if (activeFilter === "off" && device.enabled) return false
      if (q && !`${device.name} ${device.code}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [devices, tab, kindFilter, zoneFilter, statusFilter, activeFilter, query])

  const kpi = useMemo(() => {
    let online = 0
    let active = 0
    let errors = 0
    let disabled = 0
    for (const device of devices) {
      if (isOnline(device)) online += 1
      if (device.enabled) active += 1
      else disabled += 1
      const status = device.runtime.status
      if (status && ERROR.has(status)) errors += 1
    }
    return { total: devices.length, online, active, errors, disabled }
  }, [devices])

  const columns =
    categories.find((cat) => cat.id === tab)?.columns ??
    CATEGORY_COLUMNS[tab] ??
    CATEGORY_COLUMNS.all

  const kindsForTab = types.filter(
    (item) => tab === "all" || item.category === tab,
  )
  const typeMeta = types.find((item) => item.kind === form.kind)
  const formFields = typeMeta?.fields ?? KIND_FIELDS[form.kind] ?? ["name", "code"]

  const saveMutation = useMutation({
    mutationFn: async () => {
      const speed = form.speed.trim() ? Number(form.speed) : undefined
      const battery = form.battery.trim() ? Number(form.battery) : undefined
      const configuration: Record<string, unknown> = {}
      if (form.zoneId) configuration.zoneId = form.zoneId
      if (formFields.includes("metricKind")) {
        configuration.metricKind = form.metricKind
        configuration.metricUnit = form.metricUnit || null
        configuration.metricMin = form.metricMin.trim()
          ? Number(form.metricMin)
          : null
        configuration.metricMax = form.metricMax.trim()
          ? Number(form.metricMax)
          : null
      }
      if (editing) {
        return patchSimFleetDevice(editing.id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          description: form.description.trim() || null,
          kind: form.kind,
          speed,
          configuration,
        })
      }
      const body: FleetCreate = {
        kind: form.kind,
        name: form.name.trim() || undefined,
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        speed,
        battery,
        configuration,
      }
      return createSimFleetDevice(body)
    },
    onSuccess: () => {
      showSuccessToast(editing ? "Оборудование обновлено" : "Оборудование добавлено")
      setFormOpen(false)
      setEditing(null)
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: handleError,
  })

  const toggleMutation = useMutation({
    mutationFn: (device: FleetDevice) =>
      patchSimFleetDevice(device.id, { enabled: !device.enabled }),
    onSuccess: (row) => {
      showSuccessToast(row.enabled ? "Оборудование включено" : "Оборудование отключено")
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: handleError,
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveSimFleetDevice(id),
    onSuccess: () => {
      showSuccessToast("Оборудование архивировано")
      setArchiveTarget(null)
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: handleError,
  })

  function openCreate() {
    setEditing(null)
    const defaultKind = kindsForTab[0]?.kind ?? "agv"
    setForm({ ...emptyForm, kind: defaultKind })
    setFormOpen(true)
  }

  function openEdit(device: FleetDevice) {
    setEditing(device)
    setForm({
      name: device.name,
      code: device.code,
      kind: device.kind,
      description: device.description ?? "",
      zoneId: device.configuration.zoneId ?? "",
      speed: device.configuration.speed ? String(device.configuration.speed) : "",
      battery:
        device.configuration.battery != null
          ? String(device.configuration.battery)
          : "",
      metricKind: device.configuration.metricKind ?? "temperature",
      metricUnit: device.configuration.metricUnit ?? "",
      metricMin:
        device.configuration.metricMin != null
          ? String(device.configuration.metricMin)
          : "",
      metricMax:
        device.configuration.metricMax != null
          ? String(device.configuration.metricMax)
          : "",
    })
    setFormOpen(true)
  }

  function cellValue(device: FleetDevice, column: string): ReactNode {
    switch (column) {
      case "name":
        return device.name
      case "code":
        return <span className="font-mono text-xs">{device.code}</span>
      case "kind":
        return kindLabel(device.kind)
      case "subtype":
        return device.configuration.metricKind
          ? getSensorMetricLabel(device.configuration.metricKind)
          : kindLabel(device.kind)
      case "zone":
        return zoneName(device.configuration.zoneId, zones)
      case "status":
        if (device.runtime.status) {
          return getDeviceStatusLabel(device.runtime.status)
        }
        return device.runtime.inSimulation ? "—" : "Не в runtime"
      case "battery":
        return device.runtime.battery != null
          ? `${Math.round(device.runtime.battery)}%`
          : "—"
      case "task":
        return (
          <span className="font-mono text-xs">{device.runtime.taskId ?? "—"}</span>
        )
      case "value": {
        const value = device.runtime.metric ?? device.configuration.metric
        return value != null ? String(value) : "—"
      }
      case "unit":
        return (
          device.runtime.metricUnit || device.configuration.metricUnit || "—"
        )
      case "enabled":
        return device.enabled ? "Да" : "Нет"
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Действия
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setViewing(device)}>
                Просмотр
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem onClick={() => openEdit(device)}>
                    Редактировать
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleMutation.mutate(device)}>
                    {device.enabled ? "Отключить" : "Включить"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setArchiveTarget(device)}>
                    Архивировать
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      default:
        return "—"
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Оборудование
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Состав и конфигурация устройств склада. Состояние, телеметрия и
            задания — только просмотр.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <FaPlus className="size-3.5" aria-hidden />
            Добавить оборудование
          </Button>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Всего" value={kpi.total} />
        <Kpi label="В сети" value={kpi.online} />
        <Kpi label="Активно" value={kpi.active} />
        <Kpi label="Ошибки" value={kpi.errors} />
        <Kpi label="Отключено" value={kpi.disabled} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as EquipmentCategoryId)
          setKindFilter(ALL)
        }}
        className="mb-4"
      >
        <TabsList
          variant="line"
          className="mb-1 w-full min-w-0 justify-start overflow-x-auto"
        >
          {categories.map((cat) => {
            const Icon =
              CATEGORY_ICONS[cat.id as EquipmentCategoryId] ?? CATEGORY_ICONS.other
            return (
              <TabsTrigger key={cat.id} value={cat.id} className="shrink-0">
                <Icon className="size-3.5" aria-hidden />
                {cat.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию или коду"
          className="w-56"
          aria-label="Поиск"
        />
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-44" aria-label="Тип">
            <SelectValue placeholder="Тип" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все типы</SelectItem>
            {kindsForTab.map((item) => (
              <SelectItem key={item.kind} value={item.kind}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger className="w-44" aria-label="Зона">
            <SelectValue placeholder="Зона" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все зоны</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" aria-label="Состояние">
            <SelectValue placeholder="Состояние" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все состояния</SelectItem>
            {["idle", "moving", "charging", "running", "occupied", "fault", "offline"].map(
              (status) => (
                <SelectItem key={status} value={status}>
                  {getDeviceStatusLabel(status)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-44" aria-label="Активность">
            <SelectValue placeholder="Активность" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все</SelectItem>
            <SelectItem value="on">Активно</SelectItem>
            <SelectItem value="off">Отключено</SelectItem>
          </SelectContent>
        </Select>
        <FetchingIndicator active={fleetQuery.isFetching} />
      </div>

      {fleetQuery.isError ? (
        <p className="text-sm text-destructive">Не удалось загрузить оборудование</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column}
                    className={cn(column === "actions" && "text-right")}
                  >
                    {COLUMN_LABELS[column] ?? column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((device) => (
                <TableRow key={device.id}>
                  {columns.map((column) => (
                    <TableCell
                      key={column}
                      className={cn(
                        column === "name" && "font-medium",
                        column === "actions" && "text-right",
                      )}
                    >
                      {cellValue(device, column)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!fleetQuery.isLoading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground"
                  >
                    Нет оборудования по выбранным фильтрам
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Редактировать оборудование" : "Добавить оборудование"}
            </DialogTitle>
            <DialogDescription>
              Меняется только конфигурация. Телеметрия и позиция runtime недоступны.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
            <Field label="Тип оборудования">
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, kind: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((item) => (
                    <SelectItem key={item.kind} value={item.kind}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {formFields.includes("name") ? (
              <Field label="Название">
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="AGV Север"
                />
              </Field>
            ) : null}
            {formFields.includes("code") ? (
              <Field label="Код">
                <Input
                  value={form.code}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                  placeholder="agv-4"
                  className="font-mono"
                />
              </Field>
            ) : null}
            {formFields.includes("zoneId") && zones.length > 0 ? (
              <Field label="Зона">
                <Select
                  value={form.zoneId || ALL}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      zoneId: value === ALL ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Зона" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Не указана</SelectItem>
                    {zones.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {formFields.includes("description") ? (
              <Field label="Описание">
                <Textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  rows={2}
                />
              </Field>
            ) : null}
            {formFields.includes("speed") ? (
              <Field label="Скорость, м/с">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.speed}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, speed: event.target.value }))
                  }
                />
              </Field>
            ) : null}
            {formFields.includes("battery") && !editing ? (
              <Field label="Начальный заряд, %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.battery}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      battery: event.target.value,
                    }))
                  }
                />
              </Field>
            ) : null}
            {formFields.includes("metricKind") ? (
              <>
                <Field label="Тип измерения">
                  <Select
                    value={form.metricKind}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, metricKind: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(sensorMetrics.length
                        ? sensorMetrics
                        : [
                            { id: "temperature", label: "Температура" },
                            { id: "humidity", label: "Влажность" },
                          ]
                      ).map((metric) => (
                        <SelectItem key={metric.id} value={metric.id}>
                          {metric.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Единица">
                  <Input
                    value={form.metricUnit}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        metricUnit: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Диапазон min">
                  <Input
                    type="number"
                    value={form.metricMin}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        metricMin: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Диапазон max">
                  <Input
                    type="number"
                    value={form.metricMax}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        metricMax: event.target.value,
                      }))
                    }
                  />
                </Field>
              </>
            ) : null}
            {editing?.runtime.status ? (
              <p className="text-xs text-muted-foreground" data-testid="runtime-readonly">
                Состояние: {getDeviceStatusLabel(editing.runtime.status)} · заряд:{" "}
                {editing.runtime.battery != null
                  ? `${Math.round(editing.runtime.battery)}%`
                  : "—"}{" "}
                · задача: {editing.runtime.taskId ?? "—"}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.kind}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing != null} onOpenChange={() => setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>
              {viewing
                ? `${viewing.code} · ${kindLabel(viewing.kind)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Категория</dt>
              <dd>
                {categories.find((cat) => cat.id === viewing.category)?.label ??
                  viewing.category}
              </dd>
              <dt className="text-muted-foreground">Состояние</dt>
              <dd>
                {viewing.runtime.status
                  ? getDeviceStatusLabel(viewing.runtime.status)
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Зона</dt>
              <dd>{zoneName(viewing.configuration.zoneId, zones)}</dd>
              <dt className="text-muted-foreground">В симуляции</dt>
              <dd>{viewing.runtime.inSimulation ? "Да" : "Нет"}</dd>
              <dt className="text-muted-foreground">Активно</dt>
              <dd>{viewing.enabled ? "Да" : "Нет"}</dd>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={archiveTarget != null}
        onOpenChange={() => setArchiveTarget(null)}
        title="Архивировать оборудование?"
        description="Запись останется в истории. Устройство не будет назначаться на новые задания и не войдёт в следующий запуск симуляции."
        confirmLabel="Архивировать"
        variant="danger"
        isLoading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget.id)
        }}
      />
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/** Реестр виртуальных устройств и карточка выбранного устройства. */

import { type ReactNode, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
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
import { cn } from "@/lib/utils"
import { isMobileKind, taskKindLabel } from "./simEngine.ts"
import {
  deviceKindLabel,
  deviceStatusLabel,
  deviceStatusTone,
  formatDuration,
  severityDot,
} from "./simFormat.ts"
import { deviceSimulation } from "./simStore.ts"
import type { DeviceKind, SimDevice } from "./simTypes.ts"
import { useSimData } from "./useDeviceSimulation.ts"

const KIND_ORDER: DeviceKind[] = [
  "forklift",
  "agv",
  "amr",
  "conveyor",
  "dock_door",
  "scanner",
  "sensor",
  "terminal",
  "charger",
  "printer",
]

const ALL = "all"

function batteryTone(value: number): string {
  if (value < 15) return "text-destructive"
  if (value < 30) return "text-amber-600 dark:text-amber-400"
  return "text-foreground"
}

function DeviceStatusBadge({ device }: { device: SimDevice }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
        deviceStatusTone(device.status),
      )}
    >
      {deviceStatusLabel(device.status)}
    </span>
  )
}

interface DeviceFleetPanelProps {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string) => void
}

export function DeviceFleetPanel({
  selectedDeviceId,
  onSelectDevice,
}: DeviceFleetPanelProps) {
  const data = useSimData()
  const [kindFilter, setKindFilter] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [search, setSearch] = useState("")

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.devices
      .filter((device) => {
        if (kindFilter !== ALL && device.kind !== kindFilter) return false
        if (statusFilter === "problem") {
          if (
            device.status !== "fault" &&
            device.status !== "jam" &&
            device.status !== "maintenance" &&
            !device.alarm &&
            device.online
          ) {
            return false
          }
        } else if (statusFilter === "busy") {
          if (
            !["moving", "loading", "unloading", "scanning"].includes(
              device.status,
            )
          ) {
            return false
          }
        } else if (statusFilter !== ALL && device.status !== statusFilter) {
          return false
        }
        if (
          query &&
          !`${device.name} ${device.id}`.toLowerCase().includes(query)
        ) {
          return false
        }
        return true
      })
      .sort(
        (a, b) =>
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          a.name.localeCompare(b.name, "ru"),
      )
  }, [data.devices, kindFilter, statusFilter, search])

  const taskById = useMemo(
    () => new Map(data.tasks.map((task) => [task.id, task])),
    [data.tasks],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="h-8 w-[220px] text-sm"
          placeholder="Поиск по названию или ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="h-8 w-[190px] text-sm">
            <SelectValue placeholder="Тип устройства" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все типы</SelectItem>
            {KIND_ORDER.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {deviceKindLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[190px] text-sm">
            <SelectValue placeholder="Состояние" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Любое состояние</SelectItem>
            <SelectItem value="busy">В работе</SelectItem>
            <SelectItem value="idle">Ожидание</SelectItem>
            <SelectItem value="charging">На заряде</SelectItem>
            <SelectItem value="problem">Проблемные</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Показано {rows.length} из {data.devices.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Устройство</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Состояние</TableHead>
              <TableHead className="text-right">Заряд</TableHead>
              <TableHead>Задание</TableHead>
              <TableHead>Телеметрия</TableHead>
              <TableHead className="text-right">Наработка</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((device) => {
              const task = device.taskId ? taskById.get(device.taskId) : null
              return (
                <TableRow
                  key={device.id}
                  onClick={() => onSelectDevice(device.id)}
                  className={cn(
                    "cursor-pointer",
                    device.id === selectedDeviceId && "bg-accent",
                  )}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {device.alarm && (
                        <span className="size-2 shrink-0 rounded-full bg-amber-500" />
                      )}
                      {device.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {deviceKindLabel(device.kind)}
                  </TableCell>
                  <TableCell>
                    <DeviceStatusBadge device={device} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {device.battery === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={batteryTone(device.battery)}>
                        {Math.round(device.battery)}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {task
                      ? `${taskKindLabel(task.kind)} → ${task.toLabel}`
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {device.metric === null
                      ? "—"
                      : `${device.metric}${device.metricUnit ?? ""}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatDuration(device.busySec)}
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  Под фильтр не попало ни одно устройство
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <p className="text-xs text-muted-foreground">Недостаточно данных</p>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100
      const y = 24 - ((value - min) / span) * 22
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  return (
    <svg
      viewBox="0 0 100 26"
      className="h-8 w-full"
      role="img"
      aria-label="График телеметрии"
    >
      <polyline
        points={points}
        className="fill-none stroke-primary"
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

interface DeviceInspectorProps {
  deviceId: string | null
}

export function DeviceInspector({ deviceId }: DeviceInspectorProps) {
  const data = useSimData()
  const device = data.devices.find((item) => item.id === deviceId) ?? null

  if (!device) {
    return (
      <Card className="bg-muted/30 ring-foreground/5">
        <CardContent className="px-4 py-5">
          <p className="text-sm text-muted-foreground">
            Выберите устройство на плане или в реестре, чтобы увидеть состояние,
            телеметрию и отправить команду.
          </p>
        </CardContent>
      </Card>
    )
  }

  const task = data.tasks.find((item) => item.id === device.taskId) ?? null
  const events = data.events
    .filter((event) => event.deviceId === device.id)
    .slice(0, 12)
  const worker =
    data.workers.find((item) => item.id === device.workerId) ?? null

  return (
    <Card className="ring-foreground/5">
      <CardContent className="space-y-4 px-4 py-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {deviceKindLabel(device.kind)} · {device.id}
          </p>
          <h3 className="font-heading text-base font-semibold">
            {device.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DeviceStatusBadge device={device} />
            {!device.online && <Badge variant="outline">Отключено</Badge>}
            {device.alarm && (
              <Badge variant="destructive">Авария датчика</Badge>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <InspectorRow label="Позиция">
            {device.pos.x.toFixed(1)} × {device.pos.z.toFixed(1)} м
          </InspectorRow>
          <InspectorRow label="Заряд">
            {device.battery === null ? "—" : `${Math.round(device.battery)}%`}
          </InspectorRow>
          <InspectorRow label="Ресурс до ТО">
            {Math.round(device.health)}%
          </InspectorRow>
          <InspectorRow label="Наработка">
            {formatDuration(device.busySec)}
          </InspectorRow>
          <InspectorRow label="Заданий выполнено">
            {device.tasksDone}
          </InspectorRow>
          <InspectorRow label="Отказов">{device.faultCount}</InspectorRow>
          {device.metric !== null && (
            <InspectorRow label="Измерение">
              {device.metric}
              {device.metricUnit ?? ""}
              {device.metricMin !== null && device.metricMax !== null
                ? ` (норма ${device.metricMin}…${device.metricMax})`
                : ""}
            </InspectorRow>
          )}
          {worker && (
            <InspectorRow label="Оператор">{worker.name}</InspectorRow>
          )}
        </dl>

        {device.history.length > 1 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              История измерений
            </p>
            <Sparkline values={device.history} />
          </div>
        )}

        {task && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">
              {taskKindLabel(task.kind)} · {task.id}
            </p>
            <p className="text-muted-foreground">
              {task.fromLabel} → {task.toLabel}
            </p>
            {task.palletId && (
              <p className="text-xs text-muted-foreground">
                Паллета {task.palletId}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              deviceSimulation.command({
                type: "toggleDeviceOnline",
                deviceId: device.id,
              })
            }
          >
            {device.online ? "Отключить" : "Включить"}
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              deviceSimulation.command({
                type: "injectFault",
                deviceId: device.id,
              })
            }
          >
            Смоделировать отказ
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              deviceSimulation.command({
                type: "repairDevice",
                deviceId: device.id,
              })
            }
          >
            Восстановить
          </Button>
          {isMobileKind(device.kind) && (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                deviceSimulation.command({
                  type: "recallToCharge",
                  deviceId: device.id,
                })
              }
            >
              На зарядку
            </Button>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Последние события устройства
          </p>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Событий пока нет</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {events.map((event) => (
                <li key={event.id} className="flex gap-2">
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      severityDot(event.severity),
                    )}
                  />
                  <span className="text-muted-foreground">{event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function InspectorRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </>
  )
}

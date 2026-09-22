import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { fetchWarehouseTasks } from "@/api/warehouseTasks.ts"
import { DashboardService } from "@/client/index.ts"
import { computeKpis, StatCard } from "@/components/deviceServer/SimKpiStrip.tsx"
import {
  formatPercent,
  formatSimClock,
} from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { getDeviceStatusLabel, getSimulationStatusLabel } from "@/lib/statusLabels.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_layout/control-tower")({
  component: ControlTowerPage,
})

const BUSY_STATUSES = new Set([
  "busy",
  "moving",
  "waiting",
  "loading",
  "unloading",
  "running",
  "scanning",
  "occupied",
])

function ControlTowerPage() {
  const data = useSimData()
  const kpi = computeKpis(data)
  const dashQ = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => DashboardService.getDashboardStats(),
  })
  const wmsTasksQ = useQuery({
    queryKey: ["warehouse-tasks", "kpi-strip"],
    queryFn: () => fetchWarehouseTasks({ limit: 200 }),
  })

  useEffect(() => {
    deviceSimulation.autoStart()
  }, [])

  const charging = data.devices.filter((device) => device.status === "charging").length
  const busy = data.devices.filter((device) => BUSY_STATUSES.has(device.status)).length
  const maintenance = data.devices.filter(
    (device) => device.status === "maintenance",
  ).length
  const blockedTasks = (wmsTasksQ.data?.data ?? []).filter(
    (task) => task.status === "blocked",
  ).length
  const incidents =
    data.metrics.faults + data.metrics.jams + data.metrics.alarms
  const stats = dashQ.data as Record<string, unknown> | undefined
  const live = data.state === "RUNNING"

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-6 md:px-4 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">Control Tower</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Что сейчас происходит на складе. Карта и детали — в Digital Twin,
        управление runtime — в Device Monitor.
      </p>

      <Card className="mb-6 ring-foreground/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <span
                className={cn(
                  "size-2 rounded-full",
                  live ? "bg-emerald-500" : "bg-muted-foreground/50",
                )}
              />
              {getSimulationStatusLabel(data.state, { uppercase: true })}
            </span>
            <span className="tabular-nums text-muted-foreground">
              Время:{" "}
              <span className="text-foreground">
                {formatSimClock(data.timeSec, deviceSimulation.dayStartSec)}
              </span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              Скорость:{" "}
              <span className="text-foreground">×{data.speed}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/digital-twin" search={{ tab: "map", view: "2d" }}>
                Digital Twin
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/events">События</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Склад
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
          <StatCard
            label="Заполнение"
            value={formatPercent(kpi.fillRatio)}
            hint={`${data.cellsOccupied} из ${data.cellsTotal}`}
          />
          <StatCard
            label="Паллеты"
            value={data.palletsTotal}
            hint={`принято ${data.metrics.palletsReceived}`}
          />
          <StatCard
            label="Задания"
            value={kpi.activeTasks}
            hint={`в очереди ${kpi.pendingTasks}`}
            tone={kpi.pendingTasks > 12 ? "warning" : "default"}
          />
          <StatCard
            label="Заказы"
            value={kpi.openOrders}
            hint={`отгружено ${data.metrics.ordersShipped}`}
          />
          <StatCard
            label="Пропускная способность"
            value={data.metrics.palletsPutaway + data.metrics.palletsPicked}
            hint={`размещено ${data.metrics.palletsPutaway}, отобрано ${data.metrics.palletsPicked}`}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Оборудование
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
          <StatCard label="Всего" value={data.devices.length} />
          <StatCard
            label={getDeviceStatusLabel("online")}
            value={kpi.online}
            tone={kpi.online === data.devices.length ? "good" : "default"}
          />
          <StatCard label={getDeviceStatusLabel("busy")} value={busy} />
          <StatCard label={getDeviceStatusLabel("charging")} value={charging} />
          <StatCard
            label={getDeviceStatusLabel("maintenance")}
            value={maintenance}
          />
          <StatCard
            label="Инциденты"
            value={incidents}
            hint={`отказы ${data.metrics.faults}`}
            tone={incidents > 0 ? "danger" : "good"}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Операции
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
          <StatCard
            label="Приёмка"
            value={data.metrics.palletsReceived}
            hint={`грузовиков ${data.metrics.trucksArrived}`}
          />
          <StatCard
            label="Отбор"
            value={data.metrics.palletsPicked}
            hint={`цикл ${kpi.avgCycle > 0 ? `${Math.round(kpi.avgCycle)} с` : "—"}`}
          />
          <StatCard
            label="Упаковка"
            value={data.outbound.filter((order) => order.status === "packing").length}
            hint={`заказов в работе ${kpi.openOrders}`}
          />
          <StatCard
            label="Отгрузка"
            value={data.metrics.palletsShipped}
            hint={`заказов ${data.metrics.ordersShipped}`}
          />
          <StatCard
            label="Погрузка"
            value={formatPercent(kpi.dockUtilization)}
            hint={`ушло ${data.metrics.trucksDeparted}`}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Инциденты
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 [&>*]:min-w-0">
          <StatCard
            label="Активные инциденты"
            value={incidents}
            tone={incidents > 0 ? "warning" : "good"}
          />
          <StatCard
            label="Заблокированные задания"
            value={blockedTasks}
            tone={blockedTasks > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Отказы техники"
            value={kpi.faults}
            tone={kpi.faults > 0 ? "danger" : "default"}
          />
        </div>
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">
            Камеры: {data.devices.filter((item) => item.camera?.obstacle).length}
          </p>
          {data.devices.filter((item) => item.camera?.obstacle).length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет препятствий</p>
          ) : (
            data.devices
              .filter((item) => item.camera?.obstacle)
              .map((item) => (
                <Link
                  key={item.id}
                  to="/digital-twin"
                  search={{ tab: "map", view: "3d", deviceId: item.id }}
                  className="block text-sm text-red-600 dark:text-red-400"
                >
                  {item.name} — Обнаружено препятствие
                </Link>
              ))
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/warehouse-tasks">Задания</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/equipment">Оборудование</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/warehouse-simulation">Simulation Lab</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard">Аналитика запасов</Link>
        </Button>
        {typeof stats?.total_items === "number" ? (
          <span className="self-center text-xs text-muted-foreground">
            Позиций WMS: {stats.total_items}
          </span>
        ) : null}
      </div>
    </div>
  )
}

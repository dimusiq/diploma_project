/** Ключевые показатели симуляции: пересчитываются из снимка состояния. */

import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils"
import { formatDuration, formatPercent, isMobileKind } from "./simFormat.ts"
import type { DataSnapshot } from "./simStore.ts"
import { useSimData } from "./useDeviceSimulation.ts"

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: "default" | "warning" | "danger" | "good"
}) {
  return (
    <Card className="min-w-0 ring-foreground/5">
      <CardContent className="min-w-0 px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "truncate text-lg font-semibold tabular-nums",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
            tone === "good" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function computeKpis(data: DataSnapshot) {
  const mobile = data.devices.filter((device) => isMobileKind(device.kind))
  const working = mobile.filter((device) =>
    ["moving", "waiting", "loading", "unloading"].includes(device.status),
  ).length
  const online = data.devices.filter((device) => device.online).length
  const faults = data.devices.filter(
    (device) => device.status === "fault" || device.status === "jam",
  ).length
  const pendingTasks = data.tasks.filter(
    (task) => task.status === "pending",
  ).length
  const activeTasks = data.tasks.filter(
    (task) => task.status === "assigned" || task.status === "in_progress",
  ).length
  const openOrders = data.outbound.filter(
    (order) => order.status !== "shipped",
  ).length
  const backorders = data.outbound.filter(
    (order) => order.status === "backorder",
  ).length
  const avgCycle =
    data.metrics.orderCycleCount > 0
      ? data.metrics.orderCycleSumSec / data.metrics.orderCycleCount
      : 0
  const dockUtilization =
    data.metrics.dockSec > 0
      ? data.metrics.dockBusySec / data.metrics.dockSec
      : 0
  const scanQuality =
    data.metrics.scans > 0
      ? 1 - data.metrics.scanFailures / data.metrics.scans
      : 1
  const avgBattery =
    mobile.length > 0
      ? mobile.reduce((sum, device) => sum + (device.battery ?? 0), 0) /
        mobile.length
      : 0

  return {
    mobileTotal: mobile.length,
    working,
    online,
    faults,
    pendingTasks,
    activeTasks,
    openOrders,
    backorders,
    avgCycle,
    dockUtilization,
    scanQuality,
    avgBattery,
    fillRatio: data.cellsTotal > 0 ? data.cellsOccupied / data.cellsTotal : 0,
  }
}

export function SimKpiStrip() {
  const data = useSimData()
  const kpi = computeKpis(data)

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 [&>*]:min-w-0">
      <StatCard
        label="Устройств онлайн"
        value={`${kpi.online} / ${data.devices.length}`}
        hint={kpi.faults > 0 ? `отказов: ${kpi.faults}` : "отказов нет"}
        tone={kpi.faults > 0 ? "danger" : "good"}
      />
      <StatCard
        label="Техника в работе"
        value={`${kpi.working} / ${kpi.mobileTotal}`}
        hint={`средний заряд ${Math.round(kpi.avgBattery)}%`}
        tone={kpi.avgBattery < 30 ? "warning" : "default"}
      />
      <StatCard
        label="Заполнение ячеек"
        value={formatPercent(kpi.fillRatio)}
        hint={`${data.cellsOccupied} из ${data.cellsTotal}`}
      />
      <StatCard
        label="Задания"
        value={`${kpi.activeTasks} в работе`}
        hint={`в очереди ${kpi.pendingTasks}`}
        tone={kpi.pendingTasks > 12 ? "warning" : "default"}
      />
      <StatCard
        label="Заказы в работе"
        value={kpi.openOrders}
        hint={
          kpi.backorders > 0
            ? `без запаса: ${kpi.backorders}`
            : `отгружено ${data.metrics.ordersShipped}`
        }
        tone={kpi.backorders > 0 ? "warning" : "default"}
      />
      <StatCard
        label="Средний цикл заказа"
        value={kpi.avgCycle > 0 ? formatDuration(kpi.avgCycle) : "—"}
        hint={`просрочено ${data.metrics.ordersLate}`}
        tone={data.metrics.ordersLate > 0 ? "warning" : "default"}
      />
      <StatCard
        label="Принято паллет"
        value={data.metrics.palletsReceived}
        hint={`размещено ${data.metrics.palletsPutaway}`}
      />
      <StatCard
        label="Отгружено паллет"
        value={data.metrics.palletsShipped}
        hint={`отобрано ${data.metrics.palletsPicked}`}
      />
      <StatCard
        label="Транспорт"
        value={`${data.trucks.length} на площадке`}
        hint={`принято ${data.metrics.trucksArrived}, ушло ${data.metrics.trucksDeparted}`}
      />
      <StatCard
        label="Загрузка ворот"
        value={formatPercent(kpi.dockUtilization)}
        hint={`ворот: ${data.devices.filter((d) => d.kind === "dock_door").length}`}
      />
      <StatCard
        label="Качество считывания"
        value={formatPercent(kpi.scanQuality)}
        hint={`сканирований ${data.metrics.scans}, ошибок ${data.metrics.scanFailures}`}
        tone={kpi.scanQuality < 0.9 ? "warning" : "default"}
      />
      <StatCard
        label="Инциденты"
        value={data.metrics.faults + data.metrics.jams + data.metrics.alarms}
        hint={`отказы ${data.metrics.faults}, замятия ${data.metrics.jams}, датчики ${data.metrics.alarms}`}
        tone={
          data.metrics.faults + data.metrics.jams > 0 ? "warning" : "default"
        }
      />
    </div>
  )
}

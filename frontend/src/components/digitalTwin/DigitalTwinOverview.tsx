import { computeKpis, StatCard } from "@/components/deviceServer/SimKpiStrip.tsx"
import {
  formatPercent,
  formatSimClock,
  severityDot,
} from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils.ts"

export function DigitalTwinOverview() {
  const data = useSimData()
  const kpi = computeKpis(data)
  const live = data.state === "RUNNING"
  const incidents =
    data.metrics.faults + data.metrics.jams + data.metrics.alarms
  const recent = data.events.slice(0, 8)
  const inboundOpen = data.inbound.filter(
    (order) => order.status !== "closed",
  ).length

  return (
    <div className="space-y-6">
      <Card className="ring-foreground/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-heading text-xs font-semibold tracking-[0.16em] text-muted-foreground">
              DIGITAL TWIN
            </p>
            <p className="text-sm text-muted-foreground">
              Что сейчас происходит на складе
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <span
                className={cn(
                  "size-2 rounded-full",
                  live ? "bg-emerald-500" : "bg-muted-foreground/50",
                )}
              />
              {live ? "LIVE" : data.state}
            </span>
            <span className="tabular-nums text-muted-foreground">
              Simulation time:{" "}
              <span className="text-foreground">
                {formatSimClock(data.timeSec, deviceSimulation.dayStartSec)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
        <StatCard
          label="Devices"
          value={`${kpi.online} / ${data.devices.length}`}
          hint={`${kpi.working} техники в работе`}
          tone={kpi.faults > 0 ? "danger" : "good"}
        />
        <StatCard
          label="Tasks"
          value={kpi.activeTasks}
          hint={`в очереди ${kpi.pendingTasks}`}
        />
        <StatCard
          label="Occupancy"
          value={formatPercent(kpi.fillRatio)}
          hint={`${data.cellsOccupied} из ${data.cellsTotal}`}
        />
        <StatCard
          label="Orders"
          value={kpi.openOrders}
          hint={`входящих открыто ${inboundOpen}`}
        />
        <StatCard
          label="Incidents"
          value={incidents}
          hint={`отказы ${data.metrics.faults}, замятия ${data.metrics.jams}`}
          tone={incidents > 0 ? "warning" : "good"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 [&>*]:min-w-0">
        <StatCard
          label="Inbound / Outbound"
          value={`${data.metrics.palletsReceived} / ${data.metrics.palletsShipped}`}
          hint={`размещено ${data.metrics.palletsPutaway}, отобрано ${data.metrics.palletsPicked}`}
        />
        <StatCard
          label="Transport"
          value={`${data.trucks.length} на площадке`}
          hint={`принято ${data.metrics.trucksArrived}, ушло ${data.metrics.trucksDeparted}`}
        />
        <StatCard
          label="Просроченные заказы"
          value={data.metrics.ordersLate}
          hint={`отгружено ${data.metrics.ordersShipped}`}
          tone={data.metrics.ordersLate > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h2 className="font-heading mb-3 text-sm font-semibold">
            Недавняя активность
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              События появятся, когда симуляция начнёт публиковать журнал.
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((event) => (
                <li key={event.id} className="flex items-start gap-3 py-2">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      severityDot(event.severity),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSimClock(event.at, deviceSimulation.dayStartSec)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

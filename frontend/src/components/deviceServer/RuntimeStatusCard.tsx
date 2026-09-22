import { useQuery } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { computeKpis } from "@/components/deviceServer/SimKpiStrip.tsx"
import { formatSimClock } from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { request } from "@/lib/apiClient.ts"
import { layoutSummary, validateWarehouseLayout } from "@/lib/layoutValidation.ts"
import { getEventTypeLabel, getSimulationStatusLabel } from "@/lib/statusLabels.ts"

function useSseConnected(): boolean {
  return useSyncExternalStore(
    deviceSimulation.subscribeData,
    () => deviceSimulation.sseConnected,
    () => deviceSimulation.sseConnected,
  )
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={ok ? "text-emerald-600" : "text-amber-600"}
      aria-hidden
    >
      ●
    </span>
  )
}

export function RuntimeStatusCard() {
  const data = useSimData()
  const sse = useSseConnected()
  const kpi = computeKpis(data)
  const last = data.events[0]
  const healthQ = useQuery({
    queryKey: ["system-health"],
    queryFn: () =>
      request<{ status: string; database: string }>("/api/v1/utils/health"),
    refetchInterval: 30_000,
  })
  const layoutIssues = data.topology
    ? validateWarehouseLayout(data.topology)
    : validateWarehouseLayout()
  const apiOk = healthQ.data?.status === "ok"
  const dbOk = healthQ.data?.database === "ok"

  return (
    <Card className="mb-6 bg-muted/20 ring-foreground/10">
      <CardContent className="px-4 py-4">
        <h2 className="font-heading mb-3 text-sm font-semibold tracking-tight">
          System Health
        </h2>
        <dl className="space-y-1.5">
          <Row
            label="API"
            value={healthQ.isPending ? "…" : apiOk ? "OK" : "DEGRADED"}
            ok={apiOk}
          />
          <Row
            label="Database"
            value={healthQ.isPending ? "…" : dbOk ? "OK" : "ERROR"}
            ok={dbOk}
          />
          <Row
            label="Simulation"
            value={getSimulationStatusLabel(data.state, { uppercase: true })}
            ok={data.state === "RUNNING"}
          />
          <Row
            label="SSE"
            value={sse ? "CONNECTED" : "RECONNECTING"}
            ok={sse}
          />
          <Row
            label="Events"
            value={data.events.length > 0 ? "OK" : "EMPTY"}
            ok={data.events.length > 0}
          />
          <Row
            label="Время симуляции"
            value={formatSimClock(data.timeSec, deviceSimulation.dayStartSec)}
          />
          <Row label="Скорость" value={`×${data.speed}`} />
          <Row
            label="Последнее событие"
            value={
              last
                ? `${getEventTypeLabel(last.type)}: ${last.message.slice(0, 72)}`
                : "—"
            }
          />
          <Row
            label="Устройства"
            value={`${kpi.online} / ${data.devices.length}`}
          />
          <Row label="SSE-клиенты" value="Недоступно" />
          <Row
            label="События/мин"
            value={
              data.events.length < 2
                ? "Недоступно"
                : String(
                    data.events.filter(
                      (event) => data.events[0].at - event.at <= 60,
                    ).length,
                  )
            }
          />
          <Row label="Лаг записи" value="Недоступно" />
        </dl>
        {layoutIssues.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {layoutIssues.slice(0, 6).map((issue) => (
              <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Планировка PASS: {layoutSummary(data.topology)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok?: boolean
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">
        {ok == null ? null : <Dot ok={ok} />} {label}
      </dt>
      <dd className="truncate font-mono tabular-nums">{value}</dd>
    </div>
  )
}

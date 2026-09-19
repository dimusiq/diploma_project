import { useSyncExternalStore } from "react"
import { computeKpis } from "@/components/deviceServer/SimKpiStrip.tsx"
import { formatSimClock } from "@/components/deviceServer/simFormat.ts"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { getEventTypeLabel, getSimulationStatusLabel } from "@/lib/statusLabels.ts"

function useSseConnected(): boolean {
  return useSyncExternalStore(
    deviceSimulation.subscribeData,
    () => deviceSimulation.sseConnected,
    () => deviceSimulation.sseConnected,
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono tabular-nums">{value}</dd>
    </div>
  )
}

export function RuntimeStatusCard() {
  const data = useSimData()
  const sse = useSseConnected()
  const kpi = computeKpis(data)
  const last = data.events[0]
  const manager = getSimulationStatusLabel(data.state)

  return (
    <Card className="mb-6 bg-muted/20 font-mono ring-foreground/10">
      <CardContent className="px-4 py-4">
        <h2 className="font-heading mb-3 font-sans text-sm font-semibold tracking-tight">
          Runtime
        </h2>
        <dl className="space-y-1.5">
          <Row label="SimulationManager" value={manager} />
          <Row
            label="SSE"
            value={sse ? getSimulationStatusLabel("connected") : getSimulationStatusLabel("reconnecting")}
          />
          <Row
            label="Состояние симуляции"
            value={getSimulationStatusLabel(data.state)}
          />
          <Row label="Время симуляции"
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
          <Row label="Активные задания" value={String(kpi.activeTasks)} />
        </dl>
      </CardContent>
    </Card>
  )
}

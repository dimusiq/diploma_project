/** Поток событий генератора: живой журнал с фильтрами и разбивкой по типам. */

import { useMemo, useState } from "react"
import { FiPause, FiPlay } from "react-icons/fi"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import { cn } from "@/lib/utils"
import { formatSimClock, severityDot, severityTone } from "./simFormat.ts"
import { deviceSimulation } from "./simStore.ts"
import type { SimEvent, SimEventSeverity } from "./simTypes.ts"
import { useSimData } from "./useDeviceSimulation.ts"

const SEVERITY_FILTERS: Array<{
  value: SimEventSeverity | "all"
  label: string
}> = [
  { value: "all", label: "Все" },
  { value: "info", label: "Информация" },
  { value: "success", label: "Успех" },
  { value: "warning", label: "Предупреждения" },
  { value: "error", label: "Ошибки" },
]

export function EventStreamPanel() {
  const data = useSimData()
  const [severity, setSeverity] = useState<SimEventSeverity | "all">("all")
  const [query, setQuery] = useState("")
  // Заморозка журнала: сохраняем снимок событий, чтобы читать без «убегания» строк.
  const [frozen, setFrozen] = useState<SimEvent[] | null>(null)
  const source = frozen ?? data.events

  const events = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return source.filter((event) => {
      if (severity !== "all" && event.severity !== severity) return false
      if (
        needle &&
        !`${event.type} ${event.message}`.toLowerCase().includes(needle)
      ) {
        return false
      }
      return true
    })
  }, [source, severity, query])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {SEVERITY_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="xs"
              variant={severity === filter.value ? "default" : "outline"}
              onClick={() => setSeverity(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
          <Input
            className="h-8 w-[220px] text-sm"
            placeholder="Поиск по типу или тексту"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            size="xs"
            variant={frozen ? "default" : "outline"}
            onClick={() => setFrozen(frozen ? null : data.events)}
          >
            {frozen ? (
              <>
                <FiPlay aria-hidden /> Возобновить журнал
              </>
            ) : (
              <>
                <FiPause aria-hidden /> Заморозить журнал
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {events.length} из {data.metrics.eventsTotal} событий
          </span>
        </div>

        <Card className="ring-foreground/5">
          <CardContent className="max-h-[560px] min-h-[320px] overflow-y-auto px-0 py-0">
            <ul className="divide-y">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-4 py-2">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      severityDot(event.severity),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{event.type}</span>
                      {" · "}
                      {formatSimClock(event.at, deviceSimulation.dayStartSec)}
                      {event.deviceId ? ` · ${event.deviceId}` : ""}
                      {event.entityId ? ` · ${event.entityId}` : ""}
                    </p>
                  </div>
                  <span className={cn("text-xs", severityTone(event.severity))}>
                    #{event.id}
                  </span>
                </li>
              ))}
              {events.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Событий по заданным фильтрам нет
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <Card className="bg-muted/30 ring-foreground/5">
          <CardContent className="px-4 py-4">
            <h3 className="font-heading mb-2 text-sm font-semibold">
              Типы событий
            </h3>
            <div className="space-y-1">
              {data.eventCounts.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setQuery(item.type)}
                  className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
                >
                  <span className="truncate font-mono">{item.type}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {item.count}
                  </span>
                </button>
              ))}
              {data.eventCounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Событий пока нет
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 ring-foreground/5">
          <CardContent className="px-4 py-4">
            <h3 className="font-heading mb-2 text-sm font-semibold">
              Инциденты
            </h3>
            <dl className="space-y-1 text-sm">
              <StatRow label="Отказы устройств" value={data.metrics.faults} />
              <StatRow label="Замятия конвейеров" value={data.metrics.jams} />
              <StatRow label="Аварии датчиков" value={data.metrics.alarms} />
              <StatRow
                label="Ошибки считывания"
                value={data.metrics.scanFailures}
              />
              <StatRow
                label="Циклов заряда"
                value={data.metrics.chargeCycles}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium">{value}</dd>
    </div>
  )
}

/** Поток событий генератора: живой журнал с фильтрами и разбивкой по типам. */

import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { FiPause, FiPlay } from "react-icons/fi"
import { fetchSimEvents } from "@/api/deviceServer.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  matchesEventCategory,
  OPERATOR_EVENT_CATEGORIES,
  OPERATOR_EVENT_CATEGORY_LABELS,
  type OperatorEventCategory,
} from "@/lib/simEventCategory.ts"
import { getEventTypeLabel } from "@/lib/statusLabels.ts"
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

function toSimEvent(event: {
  id: number
  at: number
  type: string
  severity: string
  message: string
  deviceId?: string | null
  entityId?: string | null
  zoneId?: string | null
  taskId?: string | null
  orderId?: string | null
}): SimEvent {
  return {
    id: event.id,
    at: event.at,
    type: event.type,
    severity: (event.severity as SimEventSeverity) || "info",
    message: event.message,
    deviceId: event.deviceId ?? null,
    entityId: event.entityId ?? null,
    zoneId: event.zoneId ?? null,
    taskId: event.taskId ?? null,
    orderId: event.orderId ?? null,
  }
}

function mergeEventLogs(live: SimEvent[], persisted: SimEvent[]): SimEvent[] {
  const merged = new Map<number, SimEvent>()
  for (const event of persisted) merged.set(event.id, event)
  for (const event of live) merged.set(event.id, event)
  return [...merged.values()].sort((a, b) => b.id - a.id)
}

export function EventStreamPanel({
  variant = "technical",
  deviceId = null,
  persistHistory = false,
}: {
  variant?: "technical" | "operator"
  deviceId?: string | null
  persistHistory?: boolean
}) {
  const data = useSimData()
  const historyQ = useQuery({
    queryKey: ["sim-events-history", deviceId],
    queryFn: () =>
      fetchSimEvents({
        limit: 400,
        device_id: deviceId ?? undefined,
      }),
    enabled: persistHistory,
    refetchInterval: persistHistory ? 15_000 : false,
  })
  const [severity, setSeverity] = useState<SimEventSeverity | "all">("all")
  const [category, setCategory] = useState<OperatorEventCategory>("all")
  const [query, setQuery] = useState("")
  const [frozen, setFrozen] = useState<SimEvent[] | null>(null)
  const persisted = useMemo(
    () => (historyQ.data?.data ?? []).map(toSimEvent),
    [historyQ.data],
  )
  const liveSource = persistHistory
    ? mergeEventLogs(data.events, persisted)
    : data.events
  const source = frozen ?? liveSource
  const operator = variant === "operator"
  const showLinks = persistHistory || operator

  const events = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return source.filter((event) => {
      if (deviceId && event.deviceId !== deviceId) return false
      if (operator) {
        if (!matchesEventCategory(event, category)) return false
      } else if (severity !== "all" && event.severity !== severity) {
        return false
      }
      if (
        needle &&
        !`${event.type} ${getEventTypeLabel(event.type)} ${event.message}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false
      }
      return true
    })
  }, [source, severity, category, query, operator, deviceId])

  return (
    <div
      className={
        operator
          ? "space-y-3"
          : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {operator
            ? OPERATOR_EVENT_CATEGORIES.map((value) => (
                <Button
                  key={value}
                  size="xs"
                  variant={category === value ? "default" : "outline"}
                  onClick={() => setCategory(value)}
                >
                  {OPERATOR_EVENT_CATEGORY_LABELS[value]}
                </Button>
              ))
            : SEVERITY_FILTERS.map((filter) => (
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
            placeholder={
              operator ? "Поиск по сообщению" : "Поиск по типу или тексту"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            size="xs"
            variant={frozen ? "default" : "outline"}
            onClick={() => setFrozen(frozen ? null : liveSource)}
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
            {events.length} из{" "}
            {persistHistory
              ? (historyQ.data?.count ?? liveSource.length)
              : data.metrics.eventsTotal}{" "}
            событий
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
                      {operator ? null : (
                        <>
                          <span>{getEventTypeLabel(event.type)}</span>
                          {" · "}
                        </>
                      )}
                      {formatSimClock(event.at, deviceSimulation.dayStartSec)}
                      {event.zoneId ? ` · ${event.zoneId}` : ""}
                      {!operator && event.entityId
                        ? ` · ${event.entityId}`
                        : ""}
                    </p>
                    {showLinks &&
                    (event.deviceId || event.taskId || event.orderId) ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {event.deviceId ? (
                          <RouterLink
                            className="text-primary hover:underline"
                            to="/equipment/$deviceId"
                            params={{ deviceId: event.deviceId }}
                          >
                            Оборудование
                          </RouterLink>
                        ) : null}
                        {event.taskId ? (
                          <RouterLink
                            className="text-primary hover:underline"
                            to="/warehouse-tasks"
                          >
                            Задание
                          </RouterLink>
                        ) : null}
                        {event.orderId ? (
                          <RouterLink
                            className="text-primary hover:underline"
                            to="/outbound-orders"
                          >
                            Заказ
                          </RouterLink>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  {operator ? null : (
                    <span className={cn("text-xs", severityTone(event.severity))}>
                      #{event.id}
                    </span>
                  )}
                </li>
              ))}
              {events.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {persistHistory && historyQ.isPending
                    ? "Загрузка истории событий…"
                    : "Нет событий за выбранный период"}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {operator ? null : (
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
                    <span className="truncate">{getEventTypeLabel(item.type)}</span>
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
      )}
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

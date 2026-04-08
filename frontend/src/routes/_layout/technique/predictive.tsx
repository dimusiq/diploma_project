import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FiActivity } from "react-icons/fi"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { request } from "@/lib/apiClient"
import {
  EQUIPMENT_TYPE_LABELS,
  type EquipmentPublic,
  type EquipmentListResponse,
  type MaintenanceRecordWithEquipmentPublic,
  type MaintenanceRecordListWithEquipmentResponse,
} from "@/api/equipment"

export const Route = createFileRoute("/_layout/technique/predictive")({
  component: PredictiveSection,
})

interface CalendarEvent {
  id: string
  equipment_id: string
  equipment_name: string | null
  interval_hours: number
  engine_hours: number | null
  next_service_at_hours: number | null
  remaining_hours: number | null
  status: string
}

interface EquipmentForecast {
  equipment: EquipmentPublic
  records: MaintenanceRecordWithEquipmentPublic[]
  nextServiceHours: number | null
  remainingHours: number | null
  status: string
  chartData: { name: string; hours: number }[]
  thresholdHours: number | null
}

function PredictiveSection() {
  const [forecasts, setForecasts] = useState<EquipmentForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [eqRes, mrRes, calRes] = await Promise.all([
          request<EquipmentListResponse>("/api/v1/equipment/?limit=200"),
          request<MaintenanceRecordListWithEquipmentResponse>(
            "/api/v1/equipment/maintenance-records?limit=500",
          ),
          request<{ data: CalendarEvent[]; count: number }>(
            "/api/v1/maintenance-calendar-events/?limit=500",
          ).catch(() => ({ data: [] as CalendarEvent[], count: 0 })),
        ])

        const calByEq = new Map<string, CalendarEvent>()
        for (const ev of calRes.data) {
          const existing = calByEq.get(ev.equipment_id)
          if (
            !existing ||
            (ev.next_service_at_hours ?? Infinity) <
              (existing.next_service_at_hours ?? Infinity)
          ) {
            calByEq.set(ev.equipment_id, ev)
          }
        }

        const recordsByEq = new Map<
          string,
          MaintenanceRecordWithEquipmentPublic[]
        >()
        for (const mr of mrRes.data) {
          const list = recordsByEq.get(mr.equipment_id) ?? []
          list.push(mr)
          recordsByEq.set(mr.equipment_id, list)
        }

        const results: EquipmentForecast[] = eqRes.data
          .filter((eq) => eq.engine_hours != null && eq.engine_hours > 0)
          .map((eq) => {
            const records = (recordsByEq.get(eq.id) ?? []).sort(
              (a, b) =>
                (a.engine_hours_at_service ?? 0) -
                (b.engine_hours_at_service ?? 0),
            )

            const cal = calByEq.get(eq.id)
            const nextServiceHours = cal?.next_service_at_hours ?? null
            const remainingHours = cal?.remaining_hours ?? null
            const status = cal?.status ?? "ok"
            const thresholdHours = nextServiceHours

            const chartData: { name: string; hours: number }[] = []

            for (const mr of records) {
              if (mr.engine_hours_at_service != null) {
                chartData.push({
                  name: mr.performed_at,
                  hours: mr.engine_hours_at_service,
                })
              }
            }

            chartData.push({
              name: "Сейчас",
              hours: eq.engine_hours!,
            })

            if (
              nextServiceHours != null &&
              nextServiceHours > eq.engine_hours!
            ) {
              const daysToService =
                remainingHours != null && remainingHours > 0
                  ? Math.ceil(remainingHours / 8)
                  : null
              chartData.push({
                name: daysToService
                  ? `+${daysToService}д (прогноз)`
                  : "Прогноз ТО",
                hours: nextServiceHours,
              })
            }

            return {
              equipment: eq,
              records,
              nextServiceHours,
              remainingHours,
              status,
              chartData,
              thresholdHours,
            }
          })

        results.sort((a, b) => {
          const order = { overdue: 0, due_soon: 1, ok: 2 }
          return (
            (order[a.status as keyof typeof order] ?? 2) -
            (order[b.status as keyof typeof order] ?? 2)
          )
        })

        setForecasts(results)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const summary = useMemo(() => {
    const overdue = forecasts.filter((f) => f.status === "overdue").length
    const dueSoon = forecasts.filter((f) => f.status === "due_soon").length
    const ok = forecasts.filter((f) => f.status === "ok").length
    return { overdue, dueSoon, ok, total: forecasts.length }
  }, [forecasts])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Прогнозная аналитика
        </h1>
        <p className="text-sm text-muted-foreground">
          Прогноз моточасов и приближающегося ТО по технике
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : forecasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FiActivity className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Нет техники с данными о моточасах
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Всего единиц</CardDescription>
                <CardTitle className="text-3xl">{summary.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Просрочено ТО</CardDescription>
                <CardTitle className="text-3xl text-red-600">
                  {summary.overdue}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Скоро ТО</CardDescription>
                <CardTitle className="text-3xl text-amber-600">
                  {summary.dueSoon}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>В норме</CardDescription>
                <CardTitle className="text-3xl text-emerald-600">
                  {summary.ok}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {forecasts.map((f) => {
              const eq = f.equipment
              const label = `${eq.brand_name} ${eq.model}`
              const statusMeta = {
                overdue: {
                  label: "Просрочено",
                  color:
                    "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
                },
                due_soon: {
                  label: "Скоро ТО",
                  color:
                    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
                },
                ok: {
                  label: "В норме",
                  color:
                    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
                },
              }[f.status] ?? {
                label: f.status,
                color: "",
              }

              const progressPct =
                f.thresholdHours && eq.engine_hours != null
                  ? Math.min(
                      100,
                      Math.round((eq.engine_hours / f.thresholdHours) * 100),
                    )
                  : null

              return (
                <Card key={eq.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-semibold">
                          {label}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {EQUIPMENT_TYPE_LABELS[eq.equipment_type] ??
                            eq.equipment_type}
                          {eq.garage_number && ` • №${eq.garage_number}`}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className={statusMeta.color}>
                        {statusMeta.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="text-muted-foreground">Текущие м/ч</div>
                        <div className="text-lg font-bold">
                          {eq.engine_hours?.toLocaleString("ru-RU") ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">
                          Следующее ТО
                        </div>
                        <div className="text-lg font-bold">
                          {f.nextServiceHours?.toLocaleString("ru-RU") ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Осталось</div>
                        <div
                          className={`text-lg font-bold ${
                            f.remainingHours != null && f.remainingHours <= 0
                              ? "text-red-600"
                              : f.remainingHours != null &&
                                  f.remainingHours < 50
                                ? "text-amber-600"
                                : ""
                          }`}
                        >
                          {f.remainingHours != null
                            ? `${f.remainingHours.toLocaleString("ru-RU")} м/ч`
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {progressPct != null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>0 м/ч</span>
                          <span>
                            {f.thresholdHours?.toLocaleString("ru-RU")} м/ч
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className={`h-full rounded-full transition-all ${
                              progressPct >= 100
                                ? "bg-red-500"
                                : progressPct >= 85
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(progressPct, 100)}%` }}
                          />
                        </div>
                        <div className="text-right text-[10px] text-muted-foreground">
                          {progressPct}%
                        </div>
                      </div>
                    )}

                    {f.chartData.length > 1 && (
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={f.chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-border"
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            className="fill-muted-foreground"
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            className="fill-muted-foreground"
                            width={50}
                          />
                          <Tooltip
                            contentStyle={{
                              fontSize: 12,
                              borderRadius: 8,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line
                            type="monotone"
                            dataKey="hours"
                            name="Моточасы"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          {f.thresholdHours != null && (
                            <ReferenceLine
                              y={f.thresholdHours}
                              stroke="hsl(var(--destructive))"
                              strokeDasharray="4 4"
                              label={{
                                value: "Порог ТО",
                                position: "right",
                                fontSize: 10,
                                fill: "hsl(var(--destructive))",
                              }}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

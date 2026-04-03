import { useQuery } from "@tanstack/react-query"
import { Fragment, useMemo, useState } from "react"
import type { MaintenanceCalendarEventPublic } from "@/api/maintenanceCalendar"
import { maintenanceCalendarApi } from "@/api/maintenanceCalendar"
import { type WorkOrderPublic, workOrdersApi } from "@/api/workOrders"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"

type ViewMode = "day" | "week" | "month"

type MaintenanceEventDragPayload = {
  kind: "maintenance_event"
  equipment_id: string
  interval_hours: number | null
}

const statusBadgeClass: Record<string, string> = {
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  due_soon: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-100",
  gray: "border-border bg-muted text-foreground",
}

export function MaintenanceCalendar({
  onMaintenanceEventDrop,
}: {
  onMaintenanceEventDrop?: (args: {
    payload: MaintenanceEventDragPayload
    start_at: string
    end_at: string
    target_work_order_id?: string | null
  }) => void
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [cursor, setCursor] = useState(() => new Date())

  const timeStartHour = 8
  const timeEndHour = 18
  const defaultDurationMinutes = 120

  const {
    rangeStart,
    rangeEnd,
    days,
    hours,
    headerLabel,
  }: {
    rangeStart: Date
    rangeEnd: Date
    days: Date[]
    hours: number[]
    headerLabel: string
  } = useMemo(() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const addDays = (d: Date, n: number) => {
      const x = new Date(d)
      x.setDate(x.getDate() + n)
      return x
    }
    const startOfWeek = (d: Date) => {
      // Понедельник как первый день недели.
      const x = startOfDay(d)
      const day = x.getDay() // 0 Sun ... 6 Sat
      const diff = day === 0 ? -6 : 1 - day
      x.setDate(x.getDate() + diff)
      return x
    }
    const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

    if (viewMode === "day") {
      const s = startOfDay(cursor)
      const e = addDays(s, 1)
      const h = Array.from({ length: timeEndHour - timeStartHour }, (_, i) => timeStartHour + i)
      return {
        rangeStart: s,
        rangeEnd: e,
        days: [s],
        hours: h,
        headerLabel: s.toLocaleDateString("ru-RU"),
      }
    }

    if (viewMode === "week") {
      const s = startOfWeek(cursor)
      const e = addDays(s, 7)
      const h = Array.from({ length: timeEndHour - timeStartHour }, (_, i) => timeStartHour + i)
      const ds = Array.from({ length: 7 }, (_, i) => addDays(s, i))
      return {
        rangeStart: s,
        rangeEnd: e,
        days: ds,
        hours: h,
        headerLabel: `${ds[0].toLocaleDateString("ru-RU")} - ${addDays(ds[6], 0).toLocaleDateString("ru-RU")}`,
      }
    }

    // month: 6 weeks grid (42 days)
    const monthStart = startOfMonth(cursor)
    const gridStart = startOfWeek(monthStart)
    const ds = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    const gridEnd = addDays(gridStart, 42)
    const h = Array.from({ length: timeEndHour - timeStartHour }, (_, i) => timeStartHour + i)
    return {
      rangeStart: gridStart,
      rangeEnd: gridEnd,
      days: ds,
      hours: h,
      headerLabel: cursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
    }
  }, [cursor, viewMode])

  const rangeFromISO = rangeStart.toISOString()
  const rangeToISO = rangeEnd.toISOString()

  const {
    data: workOrdersData,
    isLoading: workOrdersLoading,
  } = useQuery({
    queryKey: ["work-orders", "events", rangeFromISO, rangeToISO],
    queryFn: () => workOrdersApi.events({ from: rangeFromISO, to: rangeToISO }),
    staleTime: 30_000,
  })

  const {
    data: maintenanceEventsData,
    isLoading: maintenanceEventsLoading,
  } = useQuery({
    queryKey: ["maintenance-calendar-events"],
    queryFn: () => maintenanceCalendarApi.list({ limit: 200 }),
    staleTime: 60_000,
  })

  const workOrders = (workOrdersData?.data ?? []) as WorkOrderPublic[]
  const maintenanceEvents = (maintenanceEventsData?.data ?? []) as MaintenanceCalendarEventPublic[]

  /** Палитры как у кнопок приложения (outline + Badge subtle). */
  const statusPalette: Record<string, "red" | "yellow" | "green" | "gray"> = {
    overdue: "red",
    due_soon: "yellow",
    ok: "green",
  }

  const maintenanceDragType = "application/vnd.nebardak.maintenance-event"

  const renderWorkOrderPill = (order: WorkOrderPublic) => {
    const start = order.start_at ? new Date(order.start_at) : null
    const end = order.end_at ? new Date(order.end_at) : null

    const timeLabel =
      start && end
        ? `${String(start.getHours()).padStart(2, "0")}:${String(
            start.getMinutes(),
          ).padStart(2, "0")} - ${String(end.getHours()).padStart(2, "0")}:${String(
            end.getMinutes(),
          ).padStart(2, "0")}`
        : ""

    return (
      <div
        key={order.id}
        className="rounded-md border border-border/80 bg-card/80 p-1"
      >
        <p className="truncate text-xs font-medium">
          {order.title}
        </p>
        {timeLabel ? (
          <p className="text-[10px] text-muted-foreground">
            {timeLabel}
          </p>
        ) : null}
      </div>
    )
  }

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const canDrag = !maintenanceEventsLoading && maintenanceEvents.length > 0

  const handleDrop = (
    e: React.DragEvent,
    slotStart: Date,
    target_work_order_id?: string | null,
  ) => {
    e.preventDefault()
    e.stopPropagation?.()
    const raw = e.dataTransfer.getData(maintenanceDragType)
    if (!raw) return

    try {
      const payload = JSON.parse(raw) as MaintenanceEventDragPayload
      if (payload.kind !== "maintenance_event") return

      const start = new Date(slotStart)
      const end = new Date(slotStart)
      end.setMinutes(end.getMinutes() + defaultDurationMinutes)

      onMaintenanceEventDrop?.({
        payload,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        target_work_order_id: target_work_order_id ?? null,
      })
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full shrink-0 lg:w-[320px]">
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-sm font-semibold">События ТО</h3>

          {maintenanceEventsLoading ? <p>Загрузка…</p> : null}
          {!maintenanceEventsLoading && maintenanceEvents.length === 0 ? (
            <p className="text-muted-foreground">Нет событий для планирования.</p>
          ) : null}

          <div className="flex max-h-[70vh] flex-col gap-2 overflow-auto pr-1">
            {maintenanceEvents.map((ev) => {
              const palette = statusPalette[ev.status] ?? "gray"
              const badgeCls = statusBadgeClass[ev.status] ?? statusBadgeClass.gray
              return (
                <Button
                  key={ev.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-auto min-h-0 w-full flex-col items-stretch gap-1 whitespace-normal px-2 py-2 text-left font-normal",
                    palette === "red" && "border-destructive/40",
                    palette === "yellow" && "border-amber-300",
                    palette === "green" && "border-green-300",
                  )}
                  draggable={canDrag}
                  style={{ cursor: canDrag ? "grab" : "default" }}
                  onDragStart={(e) => {
                    if (!canDrag) return
                    const payload: MaintenanceEventDragPayload = {
                      kind: "maintenance_event",
                      equipment_id: ev.equipment_id,
                      interval_hours: ev.interval_hours ?? null,
                    }
                    e.dataTransfer.setData(maintenanceDragType, JSON.stringify(payload))
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                >
                  <div className="flex w-full justify-between">
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs", badgeCls)}>
                      {ev.status === "overdue"
                        ? "Просрочено"
                        : ev.status === "due_soon"
                          ? "Скоро"
                          : "Норма"}
                    </span>
                  </div>
                  <span className="w-full truncate text-sm font-semibold">
                    {ev.equipment_name ?? ev.equipment_id}
                  </span>
                  <span className="w-full text-xs text-muted-foreground">
                    Интервал: {ev.interval_hours} м/ч
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={viewMode === "day" ? "default" : "outline"} onClick={() => setViewMode("day")}>
              День
            </Button>
            <Button size="sm" variant={viewMode === "week" ? "default" : "outline"} onClick={() => setViewMode("week")}>
              Неделя
            </Button>
            <Button size="sm" variant={viewMode === "month" ? "default" : "outline"} onClick={() => setViewMode("month")}>
              Месяц
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (viewMode === "day") setCursor((c) => new Date(c.getTime() - 24 * 3600 * 1000))
                else if (viewMode === "week") setCursor((c) => new Date(c.getTime() - 7 * 24 * 3600 * 1000))
                else setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
              }}
            >
              {"<"}
            </Button>
            <span className="font-medium">{headerLabel}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (viewMode === "day") setCursor((c) => new Date(c.getTime() + 24 * 3600 * 1000))
                else if (viewMode === "week") setCursor((c) => new Date(c.getTime() + 7 * 24 * 3600 * 1000))
                else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
              }}
            >
              {">"}
            </Button>
          </div>
        </div>

        {workOrdersLoading ? <p>Загрузка…</p> : null}

        {!workOrdersLoading ? (
          viewMode === "day" || viewMode === "week" ? (
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `120px repeat(${days.length}, minmax(0, 1fr))`,
                }}
              >
                <div />
                {days.map((d) => (
                  <div key={d.toISOString()} className="text-center">
                    <p className="text-sm font-medium">
                      {d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                    </p>
                  </div>
                ))}

                {hours.map((h) => (
                  <Fragment key={h}>
                    <div>
                      <p className="pr-1 text-right text-xs text-muted-foreground">
                        {String(h).padStart(2, "0")}:00
                      </p>
                    </div>
                    {days.map((day) => {
                      const slotStart = new Date(
                        day.getFullYear(),
                        day.getMonth(),
                        day.getDate(),
                        h,
                        0,
                        0,
                      )

                      const inCell = workOrders.filter((o) => {
                        if (!o.start_at) return false
                        const s = new Date(o.start_at)
                        return sameDay(s, day) && s.getHours() === h
                      })

                      return (
                        <div
                          key={`${day.toISOString()}-${h}`}
                          className="min-h-[44px] rounded-md border border-border/60 bg-muted/30"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDrop(e, slotStart)}
                        >
                          <div className="flex flex-col gap-1 p-1">
                            {inCell.map((o) => (
                              <div
                                key={o.id}
                                onDragOver={(ev) => ev.preventDefault()}
                                onDrop={(ev) => handleDrop(ev, slotStart, o.id)}
                              >
                                {renderWorkOrderPill(o)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                  <div key={d} className="text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                      {d}
                    </p>
                  </div>
                ))}
                {days.map((day) => {
                  const startAtMonth = cursor.getMonth()
                  const isInMonth = day.getMonth() === startAtMonth
                  const dayEvents = workOrders.filter((o) => {
                    if (!o.start_at) return false
                    const s = new Date(o.start_at)
                    return sameDay(s, day)
                  })
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[110px] rounded-md border border-border/60 p-2",
                        isInMonth ? "bg-card" : "bg-muted/40",
                      )}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const slotStart = new Date(
                          day.getFullYear(),
                          day.getMonth(),
                          day.getDate(),
                          timeStartHour,
                          0,
                          0,
                        )
                        handleDrop(e, slotStart)
                      }}
                    >
                      <p className={cn("text-sm font-medium", !isInMonth && "opacity-60")}>
                        {day.getDate()}
                      </p>
                      <div className="mt-2 flex flex-col gap-1">
                        {dayEvents.slice(0, 3).map((o) => (
                          <div
                            key={o.id}
                            onDragOver={(ev) => ev.preventDefault()}
                            onDrop={(ev) => {
                              const slotStart = new Date(
                                day.getFullYear(),
                                day.getMonth(),
                                day.getDate(),
                                timeStartHour,
                                0,
                                0,
                              )
                              handleDrop(ev, slotStart, o.id)
                            }}
                          >
                            {renderWorkOrderPill(o)}
                          </div>
                        ))}
                        {dayEvents.length > 3 ? (
                          <p className="text-xs text-muted-foreground">
                            +{dayEvents.length - 3}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
        ) : null}
      </div>
    </div>
  )
}

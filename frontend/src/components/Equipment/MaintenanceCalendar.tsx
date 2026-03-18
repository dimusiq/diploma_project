import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  HStack,
  Stack,
  Text,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { workOrdersApi, type WorkOrderPublic } from "@/api/workOrders"
import type { MaintenanceCalendarEventPublic } from "@/api/maintenanceCalendar"
import { maintenanceCalendarApi } from "@/api/maintenanceCalendar"

type ViewMode = "day" | "week" | "month"

type MaintenanceEventDragPayload = {
  kind: "maintenance_event"
  equipment_id: string
  interval_hours: number | null
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
  }, [cursor, timeEndHour, timeStartHour, viewMode])

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

  const statusColor: Record<string, string> = {
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
      <Box
        key={order.id}
        bg="whiteAlpha.200"
        borderWidth="1px"
        borderColor="blackAlpha.200"
        borderRadius="md"
        p={1}
      >
        <Text fontSize="xs" fontWeight="medium" truncate>
          {order.title}
        </Text>
        {timeLabel ? (
          <Text fontSize="10px" color="fg.muted">
            {timeLabel}
          </Text>
        ) : null}
      </Box>
    )
  }

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const canDrag = !maintenanceEventsLoading && maintenanceEvents.length > 0

  const handleDrop = (
    e: any,
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
    <Flex gap={4} align="flex-start">
      <Box w="320px" flexShrink={0}>
        <Stack gap={3}>
          <Heading size="sm">События ТО</Heading>

          {maintenanceEventsLoading ? <Text>Загрузка…</Text> : null}
          {!maintenanceEventsLoading && maintenanceEvents.length === 0 ? (
            <Text color="fg.muted">Нет событий для планирования.</Text>
          ) : null}

          <Stack gap={2} maxH="70vh" overflow="auto" pr={1}>
            {maintenanceEvents.map((ev) => (
              <Box
                key={ev.id}
                p={2}
                borderWidth="1px"
                borderRadius="md"
                borderColor="blackAlpha.200"
                bg={ev.status === "overdue" ? "red.50" : ev.status === "due_soon" ? "yellow.50" : "green.50"}
                draggable={canDrag}
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
                <HStack justify="space-between">
                  <Badge colorScheme={statusColor[ev.status] ?? "gray"}>{ev.status === "overdue" ? "Просрочено" : ev.status === "due_soon" ? "Скоро" : "Норма"}</Badge>
                </HStack>
                <Text fontSize="sm" fontWeight="medium" mt={1} truncate>
                  {ev.equipment_name ?? ev.equipment_id}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Интервал: {ev.interval_hours} м/ч
                </Text>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Box>

      <Box flex={1} minW={0}>
        <Flex justify="space-between" align="center" mb={3}>
          <HStack gap={2}>
            <Button size="sm" variant={viewMode === "day" ? "solid" : "outline"} onClick={() => setViewMode("day")}>
              День
            </Button>
            <Button size="sm" variant={viewMode === "week" ? "solid" : "outline"} onClick={() => setViewMode("week")}>
              Неделя
            </Button>
            <Button size="sm" variant={viewMode === "month" ? "solid" : "outline"} onClick={() => setViewMode("month")}>
              Месяц
            </Button>
          </HStack>

          <HStack gap={2}>
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
            <Text fontWeight="medium">{headerLabel}</Text>
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
          </HStack>
        </Flex>

        {workOrdersLoading ? <Text>Загрузка…</Text> : null}

        {!workOrdersLoading ? (
          <>
            {viewMode === "day" || viewMode === "week" ? (
              <Grid templateColumns={`120px repeat(${days.length}, 1fr)`} gap={2}>
                <Box />
                {days.map((d) => (
                  <Box key={d.toISOString()} textAlign="center">
                    <Text fontSize="sm" fontWeight="medium">
                      {d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                    </Text>
                  </Box>
                ))}

                {hours.map((h) => (
                  <>
                    <Box>
                      <Text fontSize="xs" color="fg.muted" textAlign="right" pr={1}>
                        {String(h).padStart(2, "0")}:00
                      </Text>
                    </Box>
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
                        <Box
                          key={`${day.toISOString()}-${h}`}
                          minH="44px"
                          borderWidth="1px"
                          borderColor="blackAlpha.100"
                          borderRadius="md"
                          bg="whiteAlpha.50"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDrop(e, slotStart)}
                        >
                          <Stack gap={1} p={1}>
                            {inCell.map((o) => (
                              <Box
                                key={o.id}
                                onDragOver={(ev) => ev.preventDefault()}
                                onDrop={(ev) => handleDrop(ev, slotStart, o.id)}
                              >
                                {renderWorkOrderPill(o)}
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )
                    })}
                  </>
                ))}
              </Grid>
            ) : (
              <Grid templateColumns="repeat(7, 1fr)" gap={2}>
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                  <Box key={d} textAlign="center">
                    <Text fontSize="xs" color="fg.muted" fontWeight="medium">
                      {d}
                    </Text>
                  </Box>
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
                    <Box
                      key={day.toISOString()}
                      minH="110px"
                      borderWidth="1px"
                      borderColor="blackAlpha.100"
                      borderRadius="md"
                      bg={isInMonth ? "whiteAlpha.60" : "whiteAlpha.30"}
                      p={2}
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
                      <Text fontSize="sm" fontWeight="medium" opacity={isInMonth ? 1 : 0.6}>
                        {day.getDate()}
                      </Text>
                          <Stack gap={1} mt={2}>
                        {dayEvents.slice(0, 3).map((o) => (
                          <Box
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
                          </Box>
                        ))}
                        {dayEvents.length > 3 ? (
                          <Text fontSize="xs" color="fg.muted">
                            +{dayEvents.length - 3}
                          </Text>
                        ) : null}
                      </Stack>
                    </Box>
                  )
                })}
              </Grid>
            )}
          </>
        ) : null}
      </Box>
    </Flex>
  )
}


import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FiBell } from "react-icons/fi"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  notificationsApi,
  NOTIFICATION_SEVERITIES,
  SEVERITY_LABELS,
  type NotificationPublic,
  type NotificationSeverity,
} from "@/api/notifications"

export const Route = createFileRoute("/_layout/technique/alerts")({
  component: AlertsSection,
})

const SEVERITY_COLORS: Record<
  NotificationSeverity,
  { bg: string; text: string }
> = {
  critical: {
    bg: "bg-red-500/15",
    text: "text-red-700 dark:text-red-400",
  },
  warning: {
    bg: "bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-400",
  },
  info: {
    bg: "bg-blue-500/15",
    text: "text-blue-700 dark:text-blue-400",
  },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function AlertsSection() {
  const [notifications, setNotifications] = useState<NotificationPublic[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      await notificationsApi.ensure()
      const res = await notificationsApi.list({
        limit: 100,
        severity: severityFilter ?? undefined,
      })
      setNotifications(res.data)
      setCount(res.count)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [severityFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Мониторинг и уведомления
        </h1>
        <p className="text-sm text-muted-foreground">
          Всего уведомлений: {count}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={severityFilter === null ? "default" : "outline"}
          onClick={() => setSeverityFilter(null)}
        >
          Все
        </Button>
        {NOTIFICATION_SEVERITIES.map((s) => {
          const colors = SEVERITY_COLORS[s]
          return (
            <Button
              key={s}
              size="sm"
              variant={severityFilter === s ? "default" : "outline"}
              onClick={() => setSeverityFilter(s)}
            >
              <span
                className={`mr-1.5 inline-block size-2 rounded-full ${colors.bg} ${colors.text}`}
              />
              {SEVERITY_LABELS[s]}
            </Button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FiBell className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {severityFilter
              ? "Нет уведомлений с выбранным уровнем"
              : "Нет уведомлений"}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Уровень</TableHead>
                <TableHead className="w-40">Тип</TableHead>
                <TableHead>Сообщение</TableHead>
                <TableHead className="w-44">Дата</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => {
                const sev = n.severity as NotificationSeverity
                const colors = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS.info
                return (
                  <TableRow key={n.id} className={n.is_read ? "opacity-60" : ""}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${colors.bg} ${colors.text} border-transparent`}
                      >
                        {SEVERITY_LABELS[sev] ?? n.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {n.type}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{n.title}</div>
                      {n.body && (
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(n.created_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

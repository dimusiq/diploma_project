import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiInbox, FiLink } from "react-icons/fi"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { request } from "@/lib/apiClient"

export const Route = createFileRoute("/_layout/technique/integrations")({
  component: IntegrationsSection,
})

interface ConnectorStub {
  id: string
  kind: string
  title: string
  status: "planned" | "beta" | "active" | "partial"
}

interface InboxEntry {
  id: string
  source: string
  event_type: string
  status: string
  created_at: string
  processed_at: string | null
  processing_error: string | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: {
    label: "Подключено",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  beta: {
    label: "Бета",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  partial: {
    label: "Частично",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  planned: {
    label: "Запланировано",
    color: "bg-zinc-500/15 text-zinc-500",
  },
}

const KIND_LABELS: Record<string, string> = {
  erp: "ERP",
  wms: "WMS",
  tms: "TMS",
  plc_scada: "PLC/SCADA",
  iot: "IoT",
  telemetry_rtls: "Телеметрия",
  identification: "Идентификация",
  custom: "Кастом",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function IntegrationsSection() {
  const [connectors, setConnectors] = useState<ConnectorStub[]>([])
  const [inbox, setInbox] = useState<InboxEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [connRes, inboxRes] = await Promise.all([
          request<{ connectors: ConnectorStub[] }>(
            "/api/v1/integrations/connectors",
          ),
          request<{ data: InboxEntry[]; count: number }>(
            "/api/v1/integrations/inbox?limit=30",
          ).catch(() => ({ data: [] as InboxEntry[], count: 0 })),
        ])
        setConnectors(connRes.connectors)
        setInbox(inboxRes.data)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Интеграции</h1>
        <p className="text-sm text-muted-foreground">
          Каталог коннекторов и журнал входящих событий
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          {connectors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <FiLink className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Каталог коннекторов пуст
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {connectors.map((c) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.planned
                return (
                  <Card key={c.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-semibold leading-snug">
                          {c.title}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={`shrink-0 border-transparent ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {KIND_LABELS[c.kind] ?? c.kind}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        ID: {c.id}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FiInbox className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                Журнал входящих событий
              </h2>
            </div>

            {inbox.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Нет входящих событий
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Источник</TableHead>
                      <TableHead>Тип события</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Ошибка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inbox.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {entry.source}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.event_type}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              entry.status === "processed"
                                ? "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : entry.status === "error"
                                  ? "border-transparent bg-red-500/15 text-red-700 dark:text-red-400"
                                  : "border-transparent bg-zinc-500/15 text-zinc-500"
                            }
                          >
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(entry.created_at)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                          {entry.processing_error ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

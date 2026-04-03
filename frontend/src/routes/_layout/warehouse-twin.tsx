import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { fetchTwinSummary, postTwinWhatIf } from "@/api/warehouseTwin.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { useTwinLivePanelState } from "@/hooks/useTwinLivePanelState.ts"
import type { TwinConnectionStatus } from "@/lib/twinRealtimeBus.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_layout/warehouse-twin")({
  component: WarehouseTwinPage,
})

function WarehouseTwinPage() {
  const { showErrorToast } = useCustomToast()
  const [simRow, setSimRow] = useState("1")
  const [simAdd, setSimAdd] = useState("10")
  const [whatIfResult, setWhatIfResult] = useState<Awaited<
    ReturnType<typeof postTwinWhatIf>
  > | null>(null)

  const { data, isPending, isError } = useQuery({
    queryKey: ["warehouse-twin-summary"],
    queryFn: fetchTwinSummary,
  })

  const whatIfMut = useMutation({
    mutationFn: () => {
      const r = Number.parseInt(simRow, 10)
      const a = Number.parseInt(simAdd, 10)
      if (!Number.isFinite(r) || r < 1 || !Number.isFinite(a) || a < 0) {
        throw new Error("Укажите ряд ≥ 1 и неотрицательное число позиций")
      }
      return postTwinWhatIf({ [r]: a })
    },
    onSuccess: (res) => setWhatIfResult(res),
    onError: (e: Error) => showErrorToast(e.message),
  })

  const chartData =
    data?.warehouse_items_by_row.map((r) => ({
      row: `Ряд ${r.storage_row}`,
      count: r.item_count,
    })) ?? []

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold tracking-tight">
        Аналитика цифрового двойника
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Сводка по вашим правам на товары и ячейки. События домена за 7 дней —
        только при праве просмотра аудита. Уведомления по порогам (ряд,
        занятость) подтягиваются при открытии центра уведомлений (
        <code>TWIN_NOTIFICATION_*</code> в настройках API).
      </p>

      <TwinLiveFeedPanel />

      <Card className="mb-8 bg-muted/20 ring-foreground/15">
        <CardContent className="pt-6">
          <h2 className="font-heading mb-2 text-sm font-semibold">
            Что если (упрощённая модель)
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Добавить условные единицы товара в ряд (1 единица ≈ 1 ячейка).
            Занятость не превышает ёмкость layout.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className="mb-1 text-xs">Ряд</p>
              <Input
                type="number"
                min={1}
                max={64}
                className="h-7 w-[100px] text-sm"
                value={simRow}
                onChange={(e) => setSimRow(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs">Добавить позиций</p>
              <Input
                type="number"
                min={0}
                className="h-7 w-[120px] text-sm"
                value={simAdd}
                onChange={(e) => setSimAdd(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              loading={whatIfMut.isPending}
              onClick={() => whatIfMut.mutate()}
            >
              Симулировать
            </Button>
          </div>
          {whatIfResult ? (
            <div className="mt-4 text-sm">
              <p>
                Занято ячеек: {whatIfResult.baseline_occupied_slots} →{" "}
                {whatIfResult.projected_occupied_slots}
              </p>
              <p>
                Заполнение:{" "}
                {whatIfResult.baseline_utilization_ratio != null
                  ? `${Math.round(whatIfResult.baseline_utilization_ratio * 100)}%`
                  : "—"}{" "}
                →{" "}
                {whatIfResult.projected_utilization_ratio != null
                  ? `${Math.round(whatIfResult.projected_utilization_ratio * 100)}%`
                  : "—"}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isPending ? (
        <Skeleton className="h-80 rounded-md" />
      ) : isError ? (
        <p className="text-sm text-destructive">Не удалось загрузить данные</p>
      ) : data ? (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Товаров на складе
                </p>
                <p className="text-2xl font-bold">
                  {data.warehouse_items_total}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Истекает за 30 дней
                </p>
                <p className="text-2xl font-bold">
                  {data.items_expiring_within_30_days}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Занято ячеек (проекция)
                </p>
                <p className="text-2xl font-bold">
                  {data.occupied_slots}
                  {data.layout_capacity_cells != null
                    ? ` / ${data.layout_capacity_cells}`
                    : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Заполнение ёмкости
                </p>
                <p className="text-2xl font-bold">
                  {data.slot_utilization_ratio != null
                    ? `${Math.round(data.slot_utilization_ratio * 100)}%`
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {Object.keys(data.domain_events_by_type).length > 0 ? (
            <div className="mb-8">
              <h2 className="font-heading mb-3 text-lg font-semibold">
                Доменные события (7 дней)
              </h2>
              <FlexWrapEvents ev={data.domain_events_by_type} />
            </div>
          ) : null}

          {chartData.length > 0 ? (
            <div>
              <h2 className="font-heading mb-3 text-lg font-semibold">
                Товары на складе по рядам
              </h2>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="row" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name="Товаров"
                      fill="var(--color-primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Нет размещённых товаров по рядам в пределах вашего доступа.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

function statusBadgeClass(status: TwinConnectionStatus): {
  label: string
  className: string
} {
  switch (status) {
    case "live":
      return {
        label: "SSE: поток активен",
        className:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      }
    case "connecting":
      return {
        label: "SSE: подключение…",
        className:
          "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
      }
    case "no_token":
      return {
        label: "Нет токена",
        className: "border-border bg-muted text-muted-foreground",
      }
    case "offline":
      return {
        label: "SSE: нет соединения",
        className: "border-destructive/40 bg-destructive/10 text-destructive",
      }
    default:
      return {
        label: "SSE: ожидание",
        className: "border-border bg-muted text-muted-foreground",
      }
  }
}

function TwinLiveFeedPanel() {
  const { status, messages } = useTwinLivePanelState()
  const sb = statusBadgeClass(status)

  return (
    <Card className="mb-8 ring-foreground/15">
      <CardContent className="pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-sm font-semibold">
            Near real-time twin
          </h2>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium",
              sb.className,
            )}
          >
            {sb.label}
          </span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Поток событий с сервера: <code>GET /api/v1/twin/stream</code> (все
          каналы, replay). Карточки и графики ниже обновляются через React Query
          при событиях (занятость, телеметрия, интеграции →{" "}
          <code>telemetry</code> и др.). Тот же контракт доступен по WebSocket{" "}
          <code>/api/v1/twin/ws</code>.
        </p>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет событий с каналами (или идёт replay только служебных
            сообщений).
          </p>
        ) : (
          <ul
            className="max-h-[220px] list-none space-y-2 overflow-y-auto rounded-md border border-border p-2 font-mono text-xs"
            style={{
              scrollbarGutter: "stable",
            }}
          >
            {messages
              .slice()
              .reverse()
              .map((m, i) => (
                <li
                  key={`${m.ts ?? ""}-${m.type ?? ""}-${i}`}
                  className="border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-muted-foreground">{m.ts ?? "—"}</span>{" "}
                  <span className="font-semibold">{m.channel}</span>
                  {m.type ? (
                    <>
                      {" "}
                      <span>{m.type}</span>
                    </>
                  ) : null}
                  {m.payload && Object.keys(m.payload).length > 0 ? (
                    <p className="truncate text-muted-foreground">
                      {JSON.stringify(m.payload).slice(0, 140)}
                      {JSON.stringify(m.payload).length > 140 ? "…" : ""}
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function FlexWrapEvents({ ev }: { ev: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(ev)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <Card key={k} size="sm" className="bg-muted/30 ring-foreground/5">
            <CardContent className="px-3 py-2 pt-4">
              <p className="text-xs font-semibold">{k}</p>
              <p className="text-lg">{v}</p>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

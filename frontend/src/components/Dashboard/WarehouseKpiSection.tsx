import { useQuery } from "@tanstack/react-query"
import { FiDownload } from "react-icons/fi"

import {
  downloadWarehouseKpiCsv,
  getWarehouseKpi,
} from "@/api/dashboard.ts"
import { ListLoadingBlock } from "@/components/Common/ListLoadingBlock.tsx"
import { SectionErrorBoundary } from "@/components/Common/SectionErrorBoundary.tsx"
import { DashboardStatCard } from "@/components/Dashboard/DashboardStatCard.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(1)} %`
}

function num(value: number | null | undefined, digits = 1, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(digits)}${suffix}`
}

function WarehouseKpiBody({
  from,
  to,
  compact = false,
}: {
  from?: string
  to?: string
  compact?: boolean
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["warehouse-kpi", from, to],
    queryFn: () => getWarehouseKpi({ from, to }),
    placeholderData: (prev) => prev,
  })

  if (isLoading && !data) {
    return <ListLoadingBlock rows={compact ? 2 : 4} className="min-h-[120px]" />
  }
  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Не удалось загрузить KPI склада</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Повторить
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Период {data.from_date} — {data.to_date}
          <span
            className="ml-2"
            style={{ visibility: isFetching ? "visible" : "hidden" }}
          >
            Обновление…
          </span>
        </p>
        {!compact && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void downloadWarehouseKpiCsv({
                from: data.from_date,
                to: data.to_date,
              })
            }
          >
            <FiDownload className="mr-1 inline" />
            CSV
          </Button>
        )}
      </div>

      <div
        className={
          compact
            ? "grid grid-cols-2 gap-3 md:grid-cols-4 [&>*]:min-w-0"
            : "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0"
        }
      >
        <DashboardStatCard
          label="Dock-to-stock"
          value={num(data.dock_to_stock_hours_avg, 1, " ч")}
          helpText={`выборок: ${data.dock_to_stock_samples}`}
          valueColor="info"
        />
        <DashboardStatCard
          label="Точность запаса"
          value={pct(data.stock_accuracy)}
          helpText={`строк счёта: ${data.stock_accuracy_lines}`}
          valueColor={
            data.stock_accuracy != null && data.stock_accuracy < 0.95
              ? "warning"
              : "success"
          }
        />
        <DashboardStatCard
          label="OTIF"
          value={pct(data.otif)}
          helpText={`отгрузок: ${data.otif_shipped}`}
          valueColor={
            data.otif != null && data.otif < 0.9 ? "warning" : "success"
          }
        />
        <DashboardStatCard
          label="Цикл заказа"
          value={num(data.order_cycle_hours_avg, 1, " ч")}
          helpText={`выборок: ${data.order_cycle_samples}`}
          valueColor="info"
        />
        <DashboardStatCard
          label="Задач / час"
          value={num(data.tasks_per_hour, 2)}
          helpText={`строк/час: ${num(data.lines_per_hour, 2)}`}
          valueColor="info"
        />
        <DashboardStatCard
          label="Простой техники"
          value={num(data.equipment_downtime_hours, 1, " ч")}
          helpText={
            data.equipment_downtime_by_reason[0]
              ? data.equipment_downtime_by_reason[0].reason
              : "по закрытым нарядам"
          }
          valueColor={
            (data.equipment_downtime_hours ?? 0) > 8 ? "warning" : "muted"
          }
        />
        <DashboardStatCard
          label="Оборачиваемость"
          value={num(data.mean_dwell_days_warehouse, 1, " дн")}
          helpText={`неликвиды: ${pct(data.dead_stock_ratio)} (${data.dead_stock_count})`}
          valueColor="info"
        />
        <DashboardStatCard
          label="Загрузка ворот"
          value={pct(data.dock_utilization)}
          helpText={`касаний: ${data.dock_touch_events}, дверей: ${data.active_dock_doors}`}
          valueColor="info"
        />
      </div>

      {!compact && data.productivity_by_employee.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h3 className="mb-3 font-heading text-base font-semibold">
              Производительность по сотрудникам
            </h3>
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Сотрудник</TableHead>
                    <TableHead>Задач</TableHead>
                    <TableHead>Строк</TableHead>
                    <TableHead>Часы</TableHead>
                    <TableHead>Задач/ч</TableHead>
                    <TableHead>Строк/ч</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.productivity_by_employee.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>{row.email ?? row.user_id.slice(0, 8)}</TableCell>
                      <TableCell>{row.tasks_completed}</TableCell>
                      <TableCell>{row.lines_completed}</TableCell>
                      <TableCell>{row.hours.toFixed(1)}</TableCell>
                      <TableCell>{num(row.tasks_per_hour, 2)}</TableCell>
                      <TableCell>{num(row.lines_per_hour, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function WarehouseKpiSection({
  from,
  to,
  compact = false,
  title = "KPI склада",
}: {
  from?: string
  to?: string
  compact?: boolean
  title?: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      <SectionErrorBoundary title="warehouse-kpi">
        <WarehouseKpiBody from={from} to={to} compact={compact} />
      </SectionErrorBoundary>
    </section>
  )
}

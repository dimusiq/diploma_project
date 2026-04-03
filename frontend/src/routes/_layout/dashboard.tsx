import { useQuery } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import {
  FiArrowDownRight,
  FiBox,
  FiCheckCircle,
  FiDownload,
  FiPackage,
  FiTruck,
  FiUsers,
} from "react-icons/fi"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { getDashboardTrends } from "@/api/dashboard.ts"
import { downloadItemsExport } from "@/api/exportItems.ts"
import { DashboardService } from "@/client/index.ts"
import {
  pieHoverActiveShape,
  pieHoverInactiveStyle,
} from "@/components/Charts/pieHoverShapes.tsx"
import { DashboardStatCard } from "@/components/Dashboard/DashboardStatCard.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

interface LatestIncomingItem {
  id: string
  title: string
  created_at: string
  status?: string
}

interface DashboardStats {
  total_items: number
  total_users: number
  status_distribution: Record<string, number>
  top_owners: Array<{
    owner_email?: string
    item_count?: number
  }>
  latest_incoming?: LatestIncomingItem[]
}

export const Route = createFileRoute("/_layout/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/" })
  },
  component: () => null,
})

function dateRangeDays(days: number): {
  from: string
  to: string
} {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

const TREND_PERIODS = [
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
] as const

export function Dashboard() {
  const [trendDays, setTrendDays] = useState(30)
  const trendRange = useMemo(() => dateRangeDays(trendDays), [trendDays])

  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () =>
      (await DashboardService.getDashboardStats()) as unknown as DashboardStats,
  })

  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: ["dashboard-trends", trendRange.from, trendRange.to],
    queryFn: () =>
      getDashboardTrends({
        from: trendRange.from,
        to: trendRange.to,
        group_by: "day",
      }),
  })

  const [isExporting, setIsExporting] = useState(false)
  const { showErrorToast } = useCustomToast()
  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      setIsExporting(true)
      try {
        await downloadItemsExport({ format })
      } catch (e) {
        showErrorToast(e instanceof Error ? e.message : "Ошибка выгрузки")
      } finally {
        setIsExporting(false)
      }
    },
    [showErrorToast],
  )

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-full px-4">
        <h1 className="pb-6 pt-12 font-heading text-2xl font-semibold tracking-tight">
          Панель управления
        </h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent>
                <Skeleton height="4" mb={2} />
                <Skeleton height="10" width="60%" mb={2} />
                <Skeleton height="3" width="80%" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !stats) {
    return (
      <div className="mx-auto w-full max-w-full px-4">
        <h1 className="pb-4 pt-12 font-heading text-2xl font-semibold tracking-tight">
          Панель управления
        </h1>
        <Card>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Не удалось загрузить данные
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Повторить
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  //Translation mapping for status names
  const StatusTranslation: Record<string, string> = {
    shipment: "Отгрузка",
    incoming: "Поступления",
    warehouse: "Склад",
    shipped: "Отгружено",
  }

  // Prepare data for status distribution pie chart
  const statusData = stats.status_distribution
    ? Object.entries(stats.status_distribution).map(([status, count]) => ({
        name: StatusTranslation[status] || status,
        value: count as number,
      }))
    : []

  // Colors for pie chart
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"]

  // Merge trends into one array for chart: { period, incoming, shipped }
  const trendsChartData = (() => {
    if (!trends?.incoming?.length && !trends?.shipped?.length) return []
    const map = new Map<
      string,
      { period: string; incoming: number; shipped: number }
    >()
    const add = (key: string, field: "incoming" | "shipped", count: number) => {
      const k = key.slice(0, 10)
      if (!map.has(k)) map.set(k, { period: k, incoming: 0, shipped: 0 })
      map.get(k)![field] = count
    }
    trends?.incoming?.forEach((p) => add(p.period, "incoming", p.count))
    trends?.shipped?.forEach((p) => add(p.period, "shipped", p.count))
    return Array.from(map.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    )
  })()

  // Prepare data for top owners bar chart
  const topOwnersData = stats.top_owners
    ? stats.top_owners.map((owner) => ({
        name: owner.owner_email?.split("@")[0] || "Unknown", // Show only username part
        items: owner.item_count || 0,
      }))
    : []

  return (
    <div className="mx-auto w-full max-w-full px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6 pt-12">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Панель управления
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={isExporting}>
              <span className="inline-flex items-center gap-2">
                <FiDownload className="size-4" />
                {isExporting ? "Выгрузка…" : "Выгрузить (CSV/Excel)"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => handleExport("csv")}>
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport("xlsx")}>
              Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DashboardStatCard
          label="Всего товаров"
          value={stats.total_items}
          helpText="Общее количество"
          valueColor="info"
          icon={<FiPackage />}
        />
        <DashboardStatCard
          label="Пользователей"
          value={stats.total_users}
          helpText="Активных пользователей"
          valueColor="info"
          icon={<FiUsers />}
        />
        <DashboardStatCard
          label="Поступления"
          value={stats.status_distribution?.incoming ?? 0}
          helpText="Ожидают приёмки на склад"
          valueColor="info"
          icon={<FiArrowDownRight />}
        />
        <DashboardStatCard
          label="На складе"
          value={stats.status_distribution?.warehouse ?? 0}
          helpText="Готовы к отгрузке"
          valueColor="success"
          icon={<FiBox />}
        />
        <DashboardStatCard
          label="В отгрузке"
          value={stats.status_distribution?.shipment ?? 0}
          helpText="Подготовлено к отправке"
          valueColor="warning"
          icon={<FiTruck />}
        />
        <DashboardStatCard
          label="Отгружено"
          value={stats.status_distribution?.shipped ?? 0}
          helpText="Архив"
          valueColor="muted"
          icon={<FiCheckCircle />}
        />
      </div>

      {/* Краткие ссылки */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <RouterLink to="/items" className="block no-underline">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-row items-center gap-3">
              <span className="text-blue-500">
                <FiArrowDownRight size={24} />
              </span>
              <div className="flex flex-col gap-0">
                <span className="font-semibold text-foreground">
                  Поступления
                </span>
                <span className="text-sm text-muted-foreground">
                  Новые товары
                </span>
              </div>
            </CardContent>
          </Card>
        </RouterLink>
        <RouterLink to="/warehouse" className="block no-underline">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-row items-center gap-3">
              <span className="text-green-600 dark:text-green-500">
                <FiBox size={24} />
              </span>
              <div className="flex flex-col gap-0">
                <span className="font-semibold text-foreground">Склад</span>
                <span className="text-sm text-muted-foreground">На складе</span>
              </div>
            </CardContent>
          </Card>
        </RouterLink>
        <RouterLink to="/shipment" className="block no-underline">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-row items-center gap-3">
              <span className="text-orange-500">
                <FiTruck size={24} />
              </span>
              <div className="flex flex-col gap-0">
                <span className="font-semibold text-foreground">Отгрузка</span>
                <span className="text-sm text-muted-foreground">
                  В отгрузке
                </span>
              </div>
            </CardContent>
          </Card>
        </RouterLink>
        <RouterLink to="/shipped" className="block no-underline">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-row items-center gap-3">
              <span className="text-green-600 dark:text-green-500">
                <FiCheckCircle size={24} />
              </span>
              <div className="flex flex-col gap-0">
                <span className="font-semibold text-foreground">Отгружено</span>
                <span className="text-sm text-muted-foreground">Архив</span>
              </div>
            </CardContent>
          </Card>
        </RouterLink>
      </div>

      {/* Последние поступления и В отгрузке */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardContent>
            <h3 className="mb-3 font-heading text-sm font-semibold">
              Последние поступления
            </h3>
            {stats.latest_incoming && stats.latest_incoming.length > 0 ? (
              <div className="flex flex-col gap-2">
                {stats.latest_incoming.map((item) => (
                  <div
                    key={item.id}
                    className="border-b border-border py-2 last:border-b-0"
                  >
                    <p className="line-clamp-1 font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString("ru-RU")
                        : ""}
                    </p>
                  </div>
                ))}
                <div className="mt-2">
                  <RouterLink
                    to="/items"
                    className="text-sm text-primary hover:underline"
                  >
                    Все поступления →
                  </RouterLink>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Нет поступлений</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 className="mb-3 font-heading text-sm font-semibold">
              В отгрузке
            </h3>
            <p className="text-2xl font-bold text-orange-500">
              {stats.status_distribution?.shipment ?? 0}
            </p>
            <p className="mb-3 text-sm text-muted-foreground">
              товаров в отгрузке
            </p>
            <RouterLink
              to="/shipment"
              className="text-sm text-primary hover:underline"
            >
              К отгрузке →
            </RouterLink>
          </CardContent>
        </Card>
      </div>

      {/* Visual Graphics Section */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status Distribution Pie Chart */}
        <Card>
          <CardContent>
            <h3 className="mb-4 font-heading text-base font-semibold">
              Распределение по статусам
            </h3>
            {statusData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${((percent as number) * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      activeShape={pieHoverActiveShape}
                      inactiveShape={pieHoverInactiveStyle}
                    >
                      {statusData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет данных о статусах
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Owners Bar Chart */}
        <Card>
          <CardContent>
            <h3 className="mb-4 font-heading text-base font-semibold">
              Топ владельцев по количеству товаров
            </h3>
            {topOwnersData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topOwnersData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis />
                    <Tooltip cursor={false} />
                    <Legend />
                    <Bar
                      dataKey="items"
                      fill="#8884d8"
                      activeBar={{
                        fill: "#8884d8",
                        opacity: 0.88,
                        stroke: "#6366f1",
                        strokeWidth: 2,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет данных о владельцах
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Тренды: поступления и отгрузки по дням */}
      <Card className="mt-8">
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-heading text-base font-semibold">
              Тренды за период
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  {TREND_PERIODS.find((p) => p.days === trendDays)?.label ??
                    "30 дней"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {TREND_PERIODS.map((p) => (
                  <DropdownMenuItem
                    key={p.days}
                    onSelect={() => setTrendDays(p.days)}
                  >
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="h-[300px]">
            {trendsLoading ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Загрузка...</p>
              </div>
            ) : trendsChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendsChartData}
                  margin={{
                    top: 8,
                    right: 8,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(v) =>
                      v
                        ? new Date(v).toLocaleDateString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                          })
                        : v
                    }
                    fontSize={11}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip
                    cursor={false}
                    labelFormatter={(v) =>
                      v ? new Date(v).toLocaleDateString("ru-RU") : v
                    }
                  />
                  <Legend />
                  <Bar
                    dataKey="incoming"
                    name="Поступления"
                    fill="#00C49F"
                    radius={[4, 4, 0, 0]}
                    activeBar={{
                      fill: "#00C49F",
                      opacity: 0.88,
                      stroke: "#009970",
                      strokeWidth: 2,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="shipped"
                    name="Отгрузки"
                    stroke="#FF8042"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Нет данных за выбранный период
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-8">
        <h3 className="mb-4 font-heading text-base font-semibold">
          Активные пользователи
        </h3>
        <Card>
          <CardContent>
            {stats.top_owners && stats.top_owners.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stats.top_owners.map((owner, index) => (
                  <div
                    key={owner.owner_email}
                    className="rounded-md border border-border p-3"
                  >
                    <p className="font-bold">#{index + 1}</p>
                    <p className="text-sm text-muted-foreground">
                      {owner.owner_email}
                    </p>
                    <p className="text-lg font-semibold">
                      {owner.item_count} товаров
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет данных о владельцах
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

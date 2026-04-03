/**
 * Панель здоровья парка: KPI-плитки и графики для вкладки Аналитика.
 * Просрочено ТО, Скоро ТО, На обслуживании, % доступности, средний простой из-за ремонтов.
 */
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  FiAlertCircle,
  FiClock,
  FiPackage,
  FiSettings,
  FiTrendingUp,
} from "react-icons/fi"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { equipmentApi } from "@/api/equipment.ts"
import {
  apiChainToLegacyFormat,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import { workOrdersApi } from "@/api/workOrders.ts"
import {
  pieHoverActiveShape,
  pieHoverInactiveStyle,
} from "@/components/Charts/pieHoverShapes.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { getRemindBeforeHoursForEquipment } from "@/utils/maintenanceChains.ts"

type ScheduleStatus = "overdue" | "due_soon" | "ok"

function getNextServiceAtHours(
  engineHours: number | null,
  intervalHours: number,
): number | null {
  if (engineHours == null) return null
  return Math.ceil(engineHours / intervalHours) * intervalHours
}

function getScheduleStatus(
  engineHours: number | null,
  nextAt: number | null,
  remindBeforeHours: number,
): ScheduleStatus {
  if (engineHours == null || nextAt == null) return "ok"
  if (engineHours >= nextAt) return "overdue"
  const remaining = nextAt - engineHours
  if (remaining <= remindBeforeHours) return "due_soon"
  return "ok"
}

interface ChainLegacy {
  id: string
  name: string
  intervalHours: number[]
  remindBeforeHours: number
  equipmentIds: string[]
}

function getIntervalForEquipment(
  equipmentId: string,
  chains: ChainLegacy[],
): number {
  const chain = chains
    .filter((c) => c.equipmentIds.includes(equipmentId))
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  return chain?.intervalHours?.[0] ?? 500
}

const MAINTENANCE_STATUS_COLORS = ["#e53e3e", "#d69e2e", "#38a169"]
const EQUIPMENT_STATUS_COLORS = ["#38a169", "#dd6b20", "#718096"]

export function ParkHealthAnalytics() {
  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ["equipment", "analytics"],
    queryFn: () => equipmentApi.list({ limit: 500 }),
  })
  const { data: chainsData } = useQuery({
    queryKey: ["maintenance-chains"],
    queryFn: () => maintenanceScheduleApi.listChains(),
  })
  const { data: configData } = useQuery({
    queryKey: ["maintenance-schedule-config"],
    queryFn: () => maintenanceScheduleApi.getConfig(),
  })
  const { data: workOrdersData } = useQuery({
    queryKey: ["work-orders", "done"],
    queryFn: () => workOrdersApi.list({ limit: 200, status: "done" }),
  })

  const chains = useMemo(
    () => (chainsData?.data ?? []).map(apiChainToLegacyFormat),
    [chainsData?.data],
  )
  const defaultInterval = (configData?.default_intervals ?? [500])[0] ?? 500
  const defaultRemind = configData?.default_remind_before_hours ?? 50
  const equipmentList = equipmentData?.data ?? []

  const kpis = useMemo(() => {
    let overdue = 0
    let dueSoon = 0
    const underMaintenance = equipmentList.filter(
      (e) => e.current_status === "maintenance",
    ).length
    const total = equipmentList.length

    for (const eq of equipmentList) {
      const interval = getIntervalForEquipment(eq.id, chains) || defaultInterval
      const nextAt = getNextServiceAtHours(eq.engine_hours ?? null, interval)
      const remindBefore = getRemindBeforeHoursForEquipment(
        eq.id,
        defaultRemind,
        chains,
      )
      const status = getScheduleStatus(
        eq.engine_hours ?? null,
        nextAt,
        remindBefore,
      )
      if (status === "overdue") overdue++
      else if (status === "due_soon") dueSoon++
    }

    const availabilityPct =
      total > 0 ? Math.round(((total - underMaintenance) / total) * 100) : 100

    const doneOrders = workOrdersData?.data ?? []
    let avgDowntimeDays: number | null = null
    if (doneOrders.length > 0) {
      const days = doneOrders.map((o) => {
        const created = new Date(o.created_at).getTime()
        const updated = new Date(o.updated_at).getTime()
        return (updated - created) / (1000 * 60 * 60 * 24)
      })
      avgDowntimeDays =
        Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
    }

    return {
      overdue,
      dueSoon,
      underMaintenance,
      total,
      availabilityPct,
      avgDowntimeDays,
    }
  }, [
    equipmentList,
    chains,
    defaultInterval,
    defaultRemind,
    workOrdersData?.data,
  ])

  const maintenanceChartData = useMemo(() => {
    const ok = kpis.total - kpis.overdue - kpis.dueSoon
    return [
      {
        name: "Просрочено ТО",
        value: kpis.overdue,
        fill: MAINTENANCE_STATUS_COLORS[0],
      },
      {
        name: "Скоро ТО",
        value: kpis.dueSoon,
        fill: MAINTENANCE_STATUS_COLORS[1],
      },
      { name: "Норма", value: ok, fill: MAINTENANCE_STATUS_COLORS[2] },
    ].filter((d) => d.value > 0)
  }, [kpis.overdue, kpis.dueSoon, kpis.total])

  const equipmentStatusChartData = useMemo(() => {
    const active = equipmentList.filter(
      (e) => e.current_status === "active",
    ).length
    const maintenance = equipmentList.filter(
      (e) => e.current_status === "maintenance",
    ).length
    const other = kpis.total - active - maintenance
    return [
      {
        name: "В эксплуатации",
        value: active,
        fill: EQUIPMENT_STATUS_COLORS[0],
      },
      {
        name: "На обслуживании",
        value: maintenance,
        fill: EQUIPMENT_STATUS_COLORS[1],
      },
      { name: "Прочее", value: other, fill: EQUIPMENT_STATUS_COLORS[2] },
    ].filter((d) => d.value > 0)
  }, [equipmentList, kpis.total])

  if (equipmentLoading) {
    return (
      <p className="text-muted-foreground">Загрузка панели здоровья парка…</p>
    )
  }

  return (
    <div>
      <h2 className="font-heading mb-2 text-lg font-semibold md:text-xl">
        Здоровье парка техники
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Ключевые показатели и распределение по статусам
      </p>

      {/* KPI-плитки */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="text-2xl text-red-500">
              <FiAlertCircle />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Просрочено ТО
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {kpis.overdue}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="text-2xl text-orange-500">
              <FiClock />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Скоро ТО
              </p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {kpis.dueSoon}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="text-2xl text-blue-500">
              <FiSettings />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                На обслуживании
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {kpis.underMaintenance}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="text-2xl text-green-500">
              <FiTrendingUp />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Доступность
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {kpis.availabilityPct}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-muted/40">
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="text-2xl text-muted-foreground">
              <FiPackage />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Ср. простой (дней)
              </p>
              <p className="text-2xl font-bold text-foreground">
                {kpis.avgDowntimeDays != null ? kpis.avgDowntimeDays : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-heading mb-4 text-sm font-semibold">
              График ТО: просрочено / скоро / норма
            </h3>
            {maintenanceChartData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={maintenanceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      activeShape={pieHoverActiveShape}
                      inactiveShape={pieHoverInactiveStyle}
                    >
                      {maintenanceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      formatter={(value: number | undefined) => [
                        value ?? 0,
                        "ед. техники",
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет техники в расписании ТО для отображения
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <h3 className="font-heading mb-4 text-sm font-semibold">
              Статус техники: в эксплуатации / на обслуживании
            </h3>
            {equipmentStatusChartData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={equipmentStatusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      activeShape={pieHoverActiveShape}
                      inactiveShape={pieHoverInactiveStyle}
                    >
                      {equipmentStatusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      formatter={(value: number | undefined) => [
                        value ?? 0,
                        "ед. техники",
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет данных о технике
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Дополнительный бар-чарт: сравнение показателей */}
      {(() => {
        const barData = [
          { label: "Просрочено ТО", count: kpis.overdue, fill: "#e53e3e" },
          { label: "Скоро ТО", count: kpis.dueSoon, fill: "#d69e2e" },
          {
            label: "На обслуживании",
            count: kpis.underMaintenance,
            fill: "#3182ce",
          },
          {
            label: "Доступно",
            count: Math.max(0, kpis.total - kpis.underMaintenance),
            fill: "#38a169",
          },
        ]
        return (
          <Card className="mt-6">
            <CardContent className="pt-4">
              <h3 className="font-heading mb-4 text-sm font-semibold">
                Сводка по парку
              </h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      angle={-20}
                      textAnchor="end"
                      height={60}
                      fontSize={12}
                    />
                    <YAxis fontSize={12} />
                    <Tooltip cursor={false} />
                    <Bar
                      dataKey="count"
                      name="Количество"
                      radius={[4, 4, 0, 0]}
                      activeBar={{
                        opacity: 0.88,
                        strokeWidth: 2,
                        stroke: "rgba(45, 55, 72, 0.45)",
                      }}
                    >
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )
      })()}
    </div>
  )
}

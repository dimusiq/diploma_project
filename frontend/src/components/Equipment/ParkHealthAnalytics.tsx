/**
 * Панель здоровья парка: KPI-плитки и графики для вкладки Аналитика.
 * Просрочено ТО, Скоро ТО, На обслуживании, % доступности, средний простой из-за ремонтов.
 */
import {
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  SimpleGrid,
  Text,
} from "@chakra-ui/react"
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
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { equipmentApi } from "@/api/equipment.ts"
import {
  apiChainToLegacyFormat,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import { workOrdersApi } from "@/api/workOrders.ts"
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
    const ok =
      kpis.total - kpis.overdue - kpis.dueSoon
    return [
      { name: "Просрочено ТО", value: kpis.overdue, fill: MAINTENANCE_STATUS_COLORS[0] },
      { name: "Скоро ТО", value: kpis.dueSoon, fill: MAINTENANCE_STATUS_COLORS[1] },
      { name: "Норма", value: ok, fill: MAINTENANCE_STATUS_COLORS[2] },
    ].filter((d) => d.value > 0)
  }, [kpis.overdue, kpis.dueSoon, kpis.total])

  const equipmentStatusChartData = useMemo(() => {
    const active = equipmentList.filter((e) => e.current_status === "active").length
    const maintenance = equipmentList.filter((e) => e.current_status === "maintenance").length
    const other = kpis.total - active - maintenance
    return [
      { name: "В эксплуатации", value: active, fill: EQUIPMENT_STATUS_COLORS[0] },
      { name: "На обслуживании", value: maintenance, fill: EQUIPMENT_STATUS_COLORS[1] },
      { name: "Прочее", value: other, fill: EQUIPMENT_STATUS_COLORS[2] },
    ].filter((d) => d.value > 0)
  }, [equipmentList, kpis.total])

  if (equipmentLoading) {
    return (
      <Text color="fg.muted">Загрузка панели здоровья парка…</Text>
    )
  }

  return (
    <Box>
      <Heading size="md" mb={2}>
        Здоровье парка техники
      </Heading>
      <Text fontSize="sm" color="fg.muted" mb={6}>
        Ключевые показатели и распределение по статусам
      </Text>

      {/* KPI-плитки */}
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 5 }} gap={4} mb={8}>
        <Card.Root
          bg="red.50"
          borderWidth="1px"
          borderColor="red.200"
          _dark={{ bg: "red.900/20", borderColor: "red.800" }}
        >
          <Card.Body>
            <Flex align="center" gap={3}>
              <Box color="red.500" fontSize="2xl">
                <FiAlertCircle />
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted" fontWeight="medium">
                  Просрочено ТО
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="red.600" _dark={{ color: "red.400" }}>
                  {kpis.overdue}
                </Text>
              </Box>
            </Flex>
          </Card.Body>
        </Card.Root>

        <Card.Root
          bg="orange.50"
          borderWidth="1px"
          borderColor="orange.200"
          _dark={{ bg: "orange.900/20", borderColor: "orange.800" }}
        >
          <Card.Body>
            <Flex align="center" gap={3}>
              <Box color="orange.500" fontSize="2xl">
                <FiClock />
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted" fontWeight="medium">
                  Скоро ТО
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="orange.600" _dark={{ color: "orange.400" }}>
                  {kpis.dueSoon}
                </Text>
              </Box>
            </Flex>
          </Card.Body>
        </Card.Root>

        <Card.Root
          bg="blue.50"
          borderWidth="1px"
          borderColor="blue.200"
          _dark={{ bg: "blue.900/20", borderColor: "blue.800" }}
        >
          <Card.Body>
            <Flex align="center" gap={3}>
              <Box color="blue.500" fontSize="2xl">
                <FiSettings />
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted" fontWeight="medium">
                  На обслуживании
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="blue.600" _dark={{ color: "blue.400" }}>
                  {kpis.underMaintenance}
                </Text>
              </Box>
            </Flex>
          </Card.Body>
        </Card.Root>

        <Card.Root
          bg="green.50"
          borderWidth="1px"
          borderColor="green.200"
          _dark={{ bg: "green.900/20", borderColor: "green.800" }}
        >
          <Card.Body>
            <Flex align="center" gap={3}>
              <Box color="green.500" fontSize="2xl">
                <FiTrendingUp />
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted" fontWeight="medium">
                  Доступность
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="green.600" _dark={{ color: "green.400" }}>
                  {kpis.availabilityPct}%
                </Text>
              </Box>
            </Flex>
          </Card.Body>
        </Card.Root>

        <Card.Root
          bg="gray.50"
          _dark={{ bg: "gray.800" }}
          borderWidth="1px"
          borderColor="border"
        >
          <Card.Body>
            <Flex align="center" gap={3}>
              <Box color="gray.500" fontSize="2xl">
                <FiPackage />
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted" fontWeight="medium">
                  Ср. простой (дней)
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="fg">
                  {kpis.avgDowntimeDays != null ? kpis.avgDowntimeDays : "—"}
                </Text>
              </Box>
            </Flex>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      {/* Графики */}
      <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={6}>
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={4}>
              График ТО: просрочено / скоро / норма
            </Heading>
            {maintenanceChartData.length > 0 ? (
              <Box height="280px">
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
                    >
                      {maintenanceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => [value ?? 0, "ед. техники"]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text color="fg.muted" fontSize="sm">
                Нет техники в расписании ТО для отображения
              </Text>
            )}
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={4}>
              Статус техники: в эксплуатации / на обслуживании
            </Heading>
            {equipmentStatusChartData.length > 0 ? (
              <Box height="280px">
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
                    >
                      {equipmentStatusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => [value ?? 0, "ед. техники"]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text color="fg.muted" fontSize="sm">
                Нет данных о технике
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      </Grid>

      {/* Дополнительный бар-чарт: сравнение показателей */}
      {(() => {
        const barData = [
          { label: "Просрочено ТО", count: kpis.overdue, fill: "#e53e3e" },
          { label: "Скоро ТО", count: kpis.dueSoon, fill: "#d69e2e" },
          { label: "На обслуживании", count: kpis.underMaintenance, fill: "#3182ce" },
          { label: "Доступно", count: Math.max(0, kpis.total - kpis.underMaintenance), fill: "#38a169" },
        ]
        return (
          <Card.Root mt={6}>
            <Card.Body>
              <Heading size="sm" mb={4}>
                Сводка по парку
              </Heading>
              <Box height="240px">
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
                    <Tooltip />
                    <Bar dataKey="count" name="Количество" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Card.Body>
          </Card.Root>
        )
      })()}
    </Box>
  )
}

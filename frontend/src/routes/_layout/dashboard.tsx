import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Link,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react"
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
import { DashboardStatCard } from "@/components/Dashboard/DashboardStatCard.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu.tsx"
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
  top_owners: Array<{ owner_email?: string; item_count?: number }>
  latest_incoming?: LatestIncomingItem[]
}

export const Route = createFileRoute("/_layout/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/" })
  },
  component: () => null,
})

function dateRangeDays(days: number): { from: string; to: string } {
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
  const trendRange = useMemo(
    () => dateRangeDays(trendDays),
    [trendDays],
  )

  const { data: stats, isLoading, isError, refetch } = useQuery({
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
      <Container maxW="full">
        <Heading size="lg" pt={12} pb={6}>
          Панель управления
        </Heading>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card.Root key={i}>
              <Card.Body>
                <Skeleton height="4" mb={2} />
                <Skeleton height="10" width="60%" mb={2} />
                <Skeleton height="3" width="80%" />
              </Card.Body>
            </Card.Root>
          ))}
        </SimpleGrid>
      </Container>
    )
  }

  if (isError || !stats) {
    return (
      <Container maxW="full">
        <Heading size="lg" pt={12} pb={4}>
          Панель управления
        </Heading>
        <Card.Root>
          <Card.Body>
            <Text color="gray.600" mb={4}>
              Не удалось загрузить данные
            </Text>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Повторить
            </Button>
          </Card.Body>
        </Card.Root>
      </Container>
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
    <Container maxW="full">
      <Flex
        justify="space-between"
        align="center"
        pt={12}
        pb={6}
        flexWrap="wrap"
        gap={3}
      >
        <Heading size="lg">Панель управления</Heading>
        <MenuRoot>
          <MenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={isExporting}>
              <Flex as="span" gap={2} align="center">
                <Box as={FiDownload} />
                {isExporting ? "Выгрузка…" : "Выгрузить (CSV/Excel)"}
              </Flex>
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem value="csv" onClick={() => handleExport("csv")}>
              CSV
            </MenuItem>
            <MenuItem value="xlsx" onClick={() => handleExport("xlsx")}>
              Excel
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
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
      </SimpleGrid>

      {/* Краткие ссылки */}
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4} mt={6}>
        <RouterLink to="/items" style={{ textDecoration: "none" }}>
          <Card.Root
            cursor="pointer"
            color="fg"
            _hover={{ bg: "gray.subtle" }}
            transition="background 0.2s"
          >
            <Card.Body
              display="flex"
              flexDirection="row"
              alignItems="center"
              gap={3}
            >
              <Box color="blue.500">
                <FiArrowDownRight size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold" color="fg">
                  Поступления
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  Новые товары
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
        <RouterLink to="/warehouse" style={{ textDecoration: "none" }}>
          <Card.Root
            cursor="pointer"
            color="fg"
            _hover={{ bg: "gray.subtle" }}
            transition="background 0.2s"
          >
            <Card.Body
              display="flex"
              flexDirection="row"
              alignItems="center"
              gap={3}
            >
              <Box color="green.500">
                <FiBox size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold" color="fg">
                  Склад
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  На складе
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
        <RouterLink to="/shipment" style={{ textDecoration: "none" }}>
          <Card.Root
            cursor="pointer"
            color="fg"
            _hover={{ bg: "gray.subtle" }}
            transition="background 0.2s"
          >
            <Card.Body
              display="flex"
              flexDirection="row"
              alignItems="center"
              gap={3}
            >
              <Box color="orange.500">
                <FiTruck size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold" color="fg">
                  Отгрузка
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  В отгрузке
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
        <RouterLink to="/shipped" style={{ textDecoration: "none" }}>
          <Card.Root
            cursor="pointer"
            color="fg"
            _hover={{ bg: "gray.subtle" }}
            transition="background 0.2s"
          >
            <Card.Body
              display="flex"
              flexDirection="row"
              alignItems="center"
              gap={3}
            >
              <Box color="green.500">
                <FiCheckCircle size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold" color="fg">
                  Отгружено
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  Архив
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
      </SimpleGrid>

      {/* Последние поступления и В отгрузке */}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={6} mt={6}>
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={3}>
              Последние поступления
            </Heading>
            {stats.latest_incoming && stats.latest_incoming.length > 0 ? (
              <VStack align="stretch" gap={2}>
                {stats.latest_incoming.map((item) => (
                  <Box
                    key={item.id}
                    py={2}
                    borderBottomWidth="1px"
                    borderColor="gray.100"
                    _last={{ borderBottomWidth: 0 }}
                  >
                    <Text fontWeight="medium" lineClamp={1}>
                      {item.title}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString("ru-RU")
                        : ""}
                    </Text>
                  </Box>
                ))}
                <Box mt={2}>
                  <RouterLink to="/items">
                    <Link fontSize="sm" color="blue.500">
                      Все поступления →
                    </Link>
                  </RouterLink>
                </Box>
              </VStack>
            ) : (
              <Text color="gray.500" fontSize="sm">
                Нет поступлений
              </Text>
            )}
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={3}>
              В отгрузке
            </Heading>
            <Text fontSize="2xl" fontWeight="bold" color="orange.500">
              {stats.status_distribution?.shipment ?? 0}
            </Text>
            <Text fontSize="sm" color="gray.600" mb={3}>
              товаров в отгрузке
            </Text>
            <RouterLink to="/shipment">
              <Link fontSize="sm" color="blue.500">
                К отгрузке →
              </Link>
            </RouterLink>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      {/* Visual Graphics Section */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={6} mt={8}>
        {/* Status Distribution Pie Chart */}
        <Card.Root>
          <Card.Body>
            <Heading size="md" mb={4}>
              Распределение по статусам
            </Heading>
            {statusData.length > 0 ? (
              <Box height="300px">
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
                    >
                      {statusData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text>Нет данных о статусах</Text>
            )}
          </Card.Body>
        </Card.Root>

        {/* Top Owners Bar Chart */}
        <Card.Root>
          <Card.Body>
            <Heading size="md" mb={4}>
              Топ владельцев по количеству товаров
            </Heading>
            {topOwnersData.length > 0 ? (
              <Box height="300px">
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
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="items" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text>Нет данных о владельцах</Text>
            )}
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      {/* Тренды: поступления и отгрузки по дням */}
      <Card.Root mt={8}>
        <Card.Body>
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={3} mb={4}>
            <Heading size="md">Тренды за период</Heading>
            <MenuRoot>
              <MenuTrigger asChild>
                <Button size="sm" variant="outline">
                  {TREND_PERIODS.find((p) => p.days === trendDays)?.label ?? "30 дней"}
                </Button>
              </MenuTrigger>
              <MenuContent>
                {TREND_PERIODS.map((p) => (
                  <MenuItem
                    key={p.days}
                    value={String(p.days)}
                    onClick={() => setTrendDays(p.days)}
                  >
                    {p.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </MenuRoot>
          </Flex>
          {trendsLoading ? (
            <Text color="gray.500">Загрузка...</Text>
          ) : trendsChartData.length > 0 ? (
            <Box height="300px">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendsChartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
            </Box>
          ) : (
            <Text color="gray.500" fontSize="sm">
              Нет данных за выбранный период
            </Text>
          )}
        </Card.Body>
      </Card.Root>

      <Box mt={8}>
        <Heading size="md" mb={4}>
          Активные пользователи
        </Heading>
        <Card.Root>
          <Card.Body>
            {stats.top_owners && stats.top_owners.length > 0 ? (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                {stats.top_owners.map((owner, index) => (
                  <Box
                    key={owner.owner_email}
                    p={3}
                    borderWidth={1}
                    borderRadius="md"
                  >
                    <Text fontWeight="bold">#{index + 1}</Text>
                    <Text fontSize="sm" color="gray.600">
                      {owner.owner_email}
                    </Text>
                    <Text fontSize="lg" fontWeight="semibold">
                      {owner.item_count} товаров
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            ) : (
              <Text>Нет данных о владельцах</Text>
            )}
          </Card.Body>
        </Card.Root>
      </Box>
    </Container>
  )
}

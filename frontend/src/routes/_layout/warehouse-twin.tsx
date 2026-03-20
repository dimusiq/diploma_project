import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Input,
  SimpleGrid,
  Text,
} from "@chakra-ui/react"
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
import useCustomToast from "@/hooks/useCustomToast.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

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
    <Container maxW="6xl" py={{ base: 6, md: 10 }}>
      <Heading size="lg" mb={2}>
        Аналитика цифрового двойника
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={8}>
        Сводка по вашим правам на товары и ячейки. События домена за 7 дней —
        только при праве просмотра аудита. Уведомления по порогам (ряд, занятость)
        подтягиваются при открытии центра уведомлений (
        <code>TWIN_NOTIFICATION_*</code> в настройках API).
      </Text>

      <Card.Root mb={8} variant="subtle">
        <Card.Body>
          <Heading size="sm" mb={2}>
            Что если (упрощённая модель)
          </Heading>
          <Text fontSize="sm" color="fg.muted" mb={3}>
            Добавить условные единицы товара в ряд (1 единица ≈ 1 ячейка). Занятость
            не превышает ёмкость layout.
          </Text>
          <Flex gap={2} align="flex-end" flexWrap="wrap">
            <Box>
              <Text fontSize="xs" mb={1}>
                Ряд
              </Text>
              <Input
                type="number"
                min={1}
                max={64}
                size="sm"
                w="100px"
                value={simRow}
                onChange={(e) => setSimRow(e.target.value)}
              />
            </Box>
            <Box>
              <Text fontSize="xs" mb={1}>
                Добавить позиций
              </Text>
              <Input
                type="number"
                min={0}
                size="sm"
                w="120px"
                value={simAdd}
                onChange={(e) => setSimAdd(e.target.value)}
              />
            </Box>
            <Button
              size="sm"
              loading={whatIfMut.isPending}
              onClick={() => whatIfMut.mutate()}
            >
              Симулировать
            </Button>
          </Flex>
          {whatIfResult ? (
            <Box mt={4} fontSize="sm">
              <Text>
                Занято ячеек: {whatIfResult.baseline_occupied_slots} →{" "}
                {whatIfResult.projected_occupied_slots}
              </Text>
              <Text>
                Заполнение:{" "}
                {whatIfResult.baseline_utilization_ratio != null
                  ? `${Math.round(whatIfResult.baseline_utilization_ratio * 100)}%`
                  : "—"}{" "}
                →{" "}
                {whatIfResult.projected_utilization_ratio != null
                  ? `${Math.round(whatIfResult.projected_utilization_ratio * 100)}%`
                  : "—"}
              </Text>
            </Box>
          ) : null}
        </Card.Body>
      </Card.Root>

      {isPending ? (
        <Skeleton h="320px" borderRadius="md" />
      ) : isError ? (
        <Text color="red.500">Не удалось загрузить данные</Text>
      ) : data ? (
        <>
          <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap={4} mb={8}>
            <Card.Root>
              <Card.Body>
                <Text fontSize="sm" color="fg.muted">
                  Товаров на складе
                </Text>
                <Text fontSize="2xl" fontWeight="bold">
                  {data.warehouse_items_total}
                </Text>
              </Card.Body>
            </Card.Root>
            <Card.Root>
              <Card.Body>
                <Text fontSize="sm" color="fg.muted">
                  Истекает за 30 дней
                </Text>
                <Text fontSize="2xl" fontWeight="bold">
                  {data.items_expiring_within_30_days}
                </Text>
              </Card.Body>
            </Card.Root>
            <Card.Root>
              <Card.Body>
                <Text fontSize="sm" color="fg.muted">
                  Занято ячеек (проекция)
                </Text>
                <Text fontSize="2xl" fontWeight="bold">
                  {data.occupied_slots}
                  {data.layout_capacity_cells != null
                    ? ` / ${data.layout_capacity_cells}`
                    : ""}
                </Text>
              </Card.Body>
            </Card.Root>
            <Card.Root>
              <Card.Body>
                <Text fontSize="sm" color="fg.muted">
                  Заполнение ёмкости
                </Text>
                <Text fontSize="2xl" fontWeight="bold">
                  {data.slot_utilization_ratio != null
                    ? `${Math.round(data.slot_utilization_ratio * 100)}%`
                    : "—"}
                </Text>
              </Card.Body>
            </Card.Root>
          </SimpleGrid>

          {Object.keys(data.domain_events_by_type).length > 0 ? (
            <Box mb={8}>
              <Heading size="md" mb={3}>
                Доменные события (7 дней)
              </Heading>
              <FlexWrapEvents ev={data.domain_events_by_type} />
            </Box>
          ) : null}

          {chartData.length > 0 ? (
            <Box>
              <Heading size="md" mb={3}>
                Товары на складе по рядам
              </Heading>
              <Box h="320px" w="100%">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="row" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name="Товаров"
                      fill="var(--chakra-colors-blue-500)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          ) : (
            <Text fontSize="sm" color="fg.muted">
              Нет размещённых товаров по рядам в пределах вашего доступа.
            </Text>
          )}
        </>
      ) : null}
    </Container>
  )
}

function FlexWrapEvents({ ev }: { ev: Record<string, number> }) {
  return (
    <Box display="flex" flexWrap="wrap" gap={2}>
      {Object.entries(ev)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <Card.Root key={k} size="sm" variant="subtle">
            <Card.Body py={2} px={3}>
              <Text fontSize="xs" fontWeight="semibold">
                {k}
              </Text>
              <Text fontSize="lg">{v}</Text>
            </Card.Body>
          </Card.Root>
        ))}
    </Box>
  )
}

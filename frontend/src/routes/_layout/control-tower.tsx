import {
  Button,
  Card,
  Container,
  Heading,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { fetchFeatureFlags } from "@/api/integrations.ts"
import { fetchKpiSnapshot } from "@/api/warehouseSimulation.ts"
import { DashboardService } from "@/client/index.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

export const Route = createFileRoute("/_layout/control-tower")({
  component: ControlTowerPage,
})

function ControlTowerPage() {
  const flagsQ = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
  })
  const dashQ = useQuery({
    queryKey: ["control-tower-dashboard"],
    queryFn: () => DashboardService.getDashboardStats(),
    enabled: flagsQ.data?.["control_tower.enabled"] === true,
  })
  const kpiQ = useQuery({
    queryKey: ["control-tower-kpi"],
    queryFn: fetchKpiSnapshot,
    enabled: flagsQ.data?.["control_tower.enabled"] === true,
  })

  if (flagsQ.isPending) {
    return (
      <Container maxW="6xl" py={8}>
        <Skeleton h="200px" />
      </Container>
    )
  }

  if (flagsQ.isError || flagsQ.data?.["control_tower.enabled"] !== true) {
    return (
      <Container maxW="6xl" py={8}>
        <Heading size="lg" mb={4}>
          Control Tower
        </Heading>
        <Text color="fg.muted">
          Экран отключён feature flag <code>control_tower.enabled</code> или
          недоступен. Обратитесь к администратору.
        </Text>
        <Button asChild mt={4} variant="outline">
          <RouterLink to="/">На главную</RouterLink>
        </Button>
      </Container>
    )
  }

  const stats = dashQ.data as Record<string, unknown> | undefined
  const kpi = kpiQ.data

  return (
    <Container maxW="6xl" py={{ base: 6, md: 10 }} px={{ base: 2, md: 4 }}>
      <Heading size="lg" mb={2}>
        Control Tower
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={8}>
        Сводка KPI, ссылка на live-поток двойника и быстрый доступ к заданиям и
        симуляциям.
      </Text>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4} mb={8}>
        <Card.Root>
          <Card.Body>
            <Text fontWeight="semibold" mb={2}>
              Операции (дашборд)
            </Text>
            {dashQ.isPending ? (
              <Skeleton h="60px" />
            ) : dashQ.isError ? (
              <Text fontSize="sm" color="fg.muted">
                Нет данных
              </Text>
            ) : (
              <VStack align="stretch" gap={1} fontSize="sm">
                <Text>
                  Всего позиций:{" "}
                  {typeof stats?.total_items === "number"
                    ? stats.total_items
                    : "—"}
                </Text>
                <Text>
                  Пользователей:{" "}
                  {typeof stats?.total_users === "number"
                    ? stats.total_users
                    : "—"}
                </Text>
              </VStack>
            )}
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <Text fontWeight="semibold" mb={2}>
              Двойник / склад
            </Text>
            {kpiQ.isPending ? (
              <Skeleton h="60px" />
            ) : kpiQ.isError ? (
              <Text fontSize="sm" color="fg.muted">
                KPI недоступны
              </Text>
            ) : (
              <VStack align="stretch" gap={1} fontSize="sm">
                <Text>
                  Точность остатков (proxy):{" "}
                  {kpi?.stock_accuracy_proxy != null
                    ? `${(kpi.stock_accuracy_proxy * 100).toFixed(1)}%`
                    : "—"}
                </Text>
                <Text>Просрочка 30д: {kpi?.near_expiry_items_30d ?? "—"}</Text>
              </VStack>
            )}
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <Text fontWeight="semibold" mb={2}>
              Live и очереди
            </Text>
            <VStack align="stretch" gap={2}>
              <Text fontSize="sm" color="fg.muted">
                Live-поток: эндпоинт <code>/api/v1/warehouse/live/stream</code>{" "}
                (тот же канал, что <code>/api/v1/twin/stream</code>), с токеном
                авторизации.
              </Text>
              <Button asChild size="sm" variant="outline">
                <RouterLink to="/warehouse-twin">Аналитика двойника</RouterLink>
              </Button>
              <Button asChild size="sm" variant="outline">
                <RouterLink to="/warehouse-tasks">Складские задания</RouterLink>
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>
    </Container>
  )
}

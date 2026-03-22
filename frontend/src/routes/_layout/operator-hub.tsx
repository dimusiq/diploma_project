import {
  Box,
  Card,
  Container,
  Heading,
  SimpleGrid,
  Text,
} from "@chakra-ui/react"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/operator-hub")({
  component: OperatorHubPage,
})

type HubCard = {
  title: string
  description: string
  to: string
}

const operatorSurfaces: HubCard[] = [
  {
    title: "Дашборд",
    description: "Сводные показатели и быстрый вход в разделы.",
    to: "/",
  },
  {
    title: "Control Tower",
    description: "Диспетчерский обзор при включённом feature flag.",
    to: "/control-tower",
  },
  {
    title: "Аналитика двойника",
    description: "KPI, занятость, события; связка с realtime twin.",
    to: "/warehouse-twin",
  },
  {
    title: "3D / 2.5D склад",
    description: "Сцена layout, топология, оверлеи симуляции.",
    to: "/warehouse-3d",
  },
  {
    title: "Склад (ячейки)",
    description: "Мониторинг размещения и сетки хранения.",
    to: "/warehouse",
  },
  {
    title: "Задания склада",
    description: "Очередь WMS-задач.",
    to: "/warehouse-tasks",
  },
  {
    title: "Симуляция и what-if",
    description: "DES-сценарии и сравнение KPI.",
    to: "/warehouse-simulation",
  },
  {
    title: "Поступления / отгрузка",
    description: "Потоки incoming и shipment.",
    to: "/items",
  },
  {
    title: "Техника и уведомления",
    description: "Парк, ТО; подраздел «Мониторинг и уведомления».",
    to: "/technique",
  },
  {
    title: "AI-ассистент",
    description: "Copilot: чат, инструменты, таймлайн запуска.",
    to: "/assistant",
  },
]

function OperatorHubPage() {
  return (
    <Container maxW="6xl" py={6}>
      <Heading size="lg" mb={2}>
        Центр платформы (оператор)
      </Heading>
      <Text color="fg.muted" mb={6} fontSize="sm" maxW="3xl">
        Единая точка входа в продуктовые поверхности: мониторинг, twin, карта
        склада, задания, симуляция и ассистент. Realtime twin подключается на
        уровне приложения (SSE/WebSocket).
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
        {operatorSurfaces.map((c) => (
          <Card.Root key={c.to} variant="outline">
            <Card.Body>
              <RouterLink to={c.to}>
                <Heading size="sm" color="blue.fg" mb={2}>
                  {c.title}
                </Heading>
              </RouterLink>
              <Text fontSize="sm" color="fg.muted">
                {c.description}
              </Text>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>
      <Box mt={10}>
        <Heading size="md" mb={3}>
          Администрирование
        </Heading>
        <Text fontSize="sm" color="fg.muted" mb={3}>
          Layout, топология, база знаний RAG, политики агента и журналы — в
          разделе «Администрирование» (суперпользователь).
        </Text>
        <RouterLink to="/admin">
          <Text fontSize="sm" color="blue.fg" fontWeight="medium">
            Открыть админку →
          </Text>
        </RouterLink>
      </Box>
    </Container>
  )
}

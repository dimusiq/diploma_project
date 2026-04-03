import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card.tsx"

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
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="font-heading mb-2 text-2xl font-semibold">
        Центр платформы (оператор)
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Единая точка входа в продуктовые поверхности: мониторинг, twin, карта
        склада, задания, симуляция и ассистент. Realtime twin подключается на
        уровне приложения (SSE/WebSocket).
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {operatorSurfaces.map((c) => (
          <Card key={c.to} className="border-border">
            <CardContent className="pt-4">
              <RouterLink to={c.to}>
                <h2 className="font-heading mb-2 text-sm font-semibold text-primary">
                  {c.title}
                </h2>
              </RouterLink>
              <p className="text-sm text-muted-foreground">{c.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-10">
        <h2 className="font-heading mb-3 text-lg font-semibold">
          Администрирование
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Layout, топология, база знаний RAG, политики агента и журналы — в
          разделе «Администрирование» (суперпользователь).
        </p>
        <RouterLink to="/admin">
          <span className="text-sm font-medium text-primary">
            Открыть админку →
          </span>
        </RouterLink>
      </div>
    </div>
  )
}

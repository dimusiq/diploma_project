import { Container, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { EquipmentList } from "@/components/Equipment/EquipmentList.tsx"
import { MaintenanceScheduleEditor } from "@/components/Equipment/MaintenanceScheduleEditor.tsx"
import { MaintenanceScheduleTable } from "@/components/Equipment/MaintenanceScheduleTable.tsx"
import { PerformedMaintenanceList } from "@/components/Equipment/PerformedMaintenanceList.tsx"

const techniqueSearchSchema = z.object({
  section: z.string().optional(),
})

export const Route = createFileRoute("/_layout/technique/")({
  component: TechniqueIndexPage,
  validateSearch: (search) => techniqueSearchSchema.parse(search ?? {}),
})

const SECTION_LABELS: Record<string, { title: string }> = {
  assets: { title: "Список техники" },
  maintenance: { title: "График ТО" },
  "maintenance-schedule": { title: "Расписание ТО" },
  "work-orders": { title: "Рабочие заказы" },
  technicians: { title: "Управление задачами техников" },
  alerts: { title: "Мониторинг и уведомления" },
  "spare-parts": { title: "Запасные части" },
  analytics: { title: "Аналитика" },
  integrations: { title: "Интеграции" },
  security: { title: "Безопасность" },
  predictive: { title: "Прогнозирование" },
}

function TechniqueIndexPage() {
  const { section } = Route.useSearch()
  const current = section ? SECTION_LABELS[section] : null

  return (
    <Container maxW="full">
      {current ? (
        <>
          <Text fontSize="md" color="fg.muted" mb={4}>
            {current.title}
          </Text>
          {section === "assets" ? (
            <EquipmentList />
          ) : section === "maintenance" ? (
            <MaintenanceScheduleTable />
          ) : section === "maintenance-schedule" ? (
            <MaintenanceScheduleEditor />
          ) : section === "work-orders" ? (
            <PerformedMaintenanceList />
          ) : (
            <Text color="fg.muted">
              Раздел в разработке. Здесь будет реализован функционал подраздела.
            </Text>
          )}
        </>
      ) : (
        <Text color="fg.muted">
          Выберите подраздел в меню слева. Каждый подраздел будет спроектирован
          отдельно.
        </Text>
      )}
    </Container>
  )
}

import { Box, Container, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { EquipmentList } from "@/components/Equipment/EquipmentList.tsx"
import { MaintenanceScheduleTable } from "@/components/Equipment/MaintenanceScheduleTable.tsx"
import { MaintenanceCalendarPage } from "@/components/Equipment/MaintenanceCalendarPage.tsx"
import { MaintenanceSettingsPage } from "@/components/Equipment/MaintenanceSettingsPage.tsx"
import { ParkHealthAnalytics } from "@/components/Equipment/ParkHealthAnalytics.tsx"
import { SparePartsList } from "@/components/Equipment/SparePartsList.tsx"
import { WorkOrderList } from "@/components/Equipment/WorkOrderList.tsx"

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
  "maintenance-schedule": { title: "Календарь ТО" },
  "maintenance-settings": { title: "Настройка ТО" },
  "work-orders": { title: "Обслуживание и ремонт техники" },
  technicians: { title: "Управление задачами техников" },
  alerts: { title: "Мониторинг и уведомления" },
  "spare-parts": { title: "Запасные части" },
  analytics: { title: "Аналитика" },
  integrations: { title: "Интеграции" },
  security: { title: "Безопасность" },
  predictive: { title: "Прогнозирование" },
}

/** По умолчанию при открытии «Техника» показываем список техники. */
const DEFAULT_SECTION = "assets"

function TechniqueIndexPage() {
  const { section: sectionParam } = Route.useSearch()
  const section = sectionParam && sectionParam in SECTION_LABELS ? sectionParam : DEFAULT_SECTION
  const current = SECTION_LABELS[section]

  return (
    <Container maxW="full">
      <Text fontSize="md" color="fg.muted" mb={4}>
        {current.title}
      </Text>
      {section === "assets" ? (
        <EquipmentList />
      ) : section === "maintenance" ? (
        <MaintenanceScheduleTable />
      ) : section === "maintenance-schedule" ? (
        <Box>
          <MaintenanceCalendarPage />
        </Box>
      ) : section === "maintenance-settings" ? (
        <MaintenanceSettingsPage />
      ) : section === "work-orders" ? (
        <WorkOrderList />
      ) : section === "analytics" ? (
        <ParkHealthAnalytics />
      ) : section === "spare-parts" ? (
        <SparePartsList />
      ) : (
        <Text color="fg.muted">
          Раздел в разработке. Здесь будет реализован функционал подраздела.
        </Text>
      )}
    </Container>
  )
}

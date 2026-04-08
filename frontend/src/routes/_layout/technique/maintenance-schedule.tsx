import { createFileRoute } from "@tanstack/react-router"

import { MaintenanceCalendarPage } from "@/components/Equipment/MaintenanceCalendarPage.tsx"

export const Route = createFileRoute("/_layout/technique/maintenance-schedule")({
  component: MaintenanceScheduleSection,
})

function MaintenanceScheduleSection() {
  return <MaintenanceCalendarPage />
}

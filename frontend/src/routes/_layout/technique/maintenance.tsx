import { createFileRoute } from "@tanstack/react-router"

import { MaintenanceScheduleTable } from "@/components/Equipment/MaintenanceScheduleTable.tsx"

export const Route = createFileRoute("/_layout/technique/maintenance")({
  component: MaintenanceSection,
})

function MaintenanceSection() {
  return <MaintenanceScheduleTable />
}

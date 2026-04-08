import { createFileRoute } from "@tanstack/react-router"

import { MaintenanceSettingsPage } from "@/components/Equipment/MaintenanceSettingsPage.tsx"

export const Route = createFileRoute("/_layout/technique/maintenance-settings")({
  component: MaintenanceSettingsSection,
})

function MaintenanceSettingsSection() {
  return <MaintenanceSettingsPage />
}

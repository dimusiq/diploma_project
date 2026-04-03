import { MaintenanceReglamentTemplatesManager } from "@/components/Equipment/MaintenanceReglamentTemplatesManager.tsx"
import { MaintenanceScheduleEditor } from "@/components/Equipment/MaintenanceScheduleEditor.tsx"

export function MaintenanceSettingsPage() {
  return (
    <div>
      <MaintenanceScheduleEditor />
      <div className="mt-10">
        <MaintenanceReglamentTemplatesManager />
      </div>
    </div>
  )
}

import { Box } from "@chakra-ui/react"

import { MaintenanceScheduleEditor } from "@/components/Equipment/MaintenanceScheduleEditor.tsx"
import { MaintenanceReglamentTemplatesManager } from "@/components/Equipment/MaintenanceReglamentTemplatesManager.tsx"

export function MaintenanceSettingsPage() {
  return (
    <Box>
      <MaintenanceScheduleEditor />
      <Box mt={10}>
        <MaintenanceReglamentTemplatesManager />
      </Box>
    </Box>
  )
}


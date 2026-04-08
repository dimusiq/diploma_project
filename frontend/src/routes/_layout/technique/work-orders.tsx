import { createFileRoute } from "@tanstack/react-router"

import { WorkOrderList } from "@/components/Equipment/WorkOrderList.tsx"

export const Route = createFileRoute("/_layout/technique/work-orders")({
  component: WorkOrdersSection,
})

function WorkOrdersSection() {
  return <WorkOrderList />
}

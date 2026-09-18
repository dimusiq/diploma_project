import { createFileRoute } from "@tanstack/react-router"
import { WarehouseTasksView } from "@/components/warehouse/WarehouseTasksView.tsx"

export const Route = createFileRoute("/_layout/warehouse-tasks")({
  component: WarehouseTasksPage,
})

function WarehouseTasksPage() {
  return <WarehouseTasksView />
}

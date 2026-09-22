import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { WarehouseTasksView } from "@/components/warehouse/WarehouseTasksView.tsx"

const warehouseTasksSearchSchema = z.object({
  task: z.string().uuid().optional().catch(undefined),
})

export const Route = createFileRoute("/_layout/warehouse-tasks")({
  validateSearch: (search) => warehouseTasksSearchSchema.parse(search),
  component: WarehouseTasksPage,
})

function WarehouseTasksPage() {
  const { task } = Route.useSearch()
  return <WarehouseTasksView highlightTaskId={task ?? null} />
}

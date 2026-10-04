import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { WarehouseTasksView } from "@/components/warehouse/WarehouseTasksView.tsx"

const warehouseTasksSearchSchema = z.object({
  task: z.string().uuid().optional().catch(undefined),
  mine: z
    .union([z.boolean(), z.literal("1"), z.literal("true"), z.literal("0")])
    .optional()
    .catch(undefined)
    .transform((v) => v === true || v === "1" || v === "true"),
})

export const Route = createFileRoute("/_layout/warehouse-tasks")({
  validateSearch: (search) => warehouseTasksSearchSchema.parse(search),
  component: WarehouseTasksPage,
})

function WarehouseTasksPage() {
  const { task, mine } = Route.useSearch()
  return (
    <WarehouseTasksView
      highlightTaskId={task ?? null}
      mineMode={Boolean(mine)}
    />
  )
}

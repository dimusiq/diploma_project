import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { WorkOrderList } from "@/components/Equipment/WorkOrderList.tsx"

const workOrdersSearchSchema = z.object({
  workOrder: z.string().uuid().optional().catch(undefined),
})

export const Route = createFileRoute("/_layout/technique/work-orders")({
  validateSearch: (search) => workOrdersSearchSchema.parse(search),
  component: WorkOrdersSection,
})

function WorkOrdersSection() {
  const { workOrder } = Route.useSearch()
  const navigate = useNavigate()
  return (
    <WorkOrderList
      selectedId={workOrder ?? null}
      onSelectedIdChange={(id) =>
        void navigate({
          to: "/technique/work-orders",
          search: id ? { workOrder: id } : {},
        })
      }
    />
  )
}

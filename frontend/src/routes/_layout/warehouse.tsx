import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback } from "react"
import { z } from "zod"

import { PullToRefresh } from "@/components/Common/PullToRefresh.tsx"
import { WarehouseHubNav } from "@/components/Common/WarehouseHubNav.tsx"
import { ItemDataTable } from "@/components/Items/ItemDataTable.tsx"
import { pageNumberSearch } from "@/lib/routeSearch.ts"

const warehouseSearchSchema = z.object({
  page: pageNumberSearch,
  search: z.string().catch(""),
  category_id: z.string().catch(""),
  sort_by: z
    .enum(["title", "created_at", "quantity", "sku", "description", "unit"])
    .catch("created_at"),
  sort_order: z.enum(["asc", "desc"]).catch("desc"),
})

export const Route = createFileRoute("/_layout/warehouse")({
  component: Warehouse,
  validateSearch: (s) => warehouseSearchSchema.parse(s),
})

function Warehouse() {
  const queryClient = useQueryClient()

  const handleRefresh = useCallback(
    async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    [queryClient],
  )

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto w-full max-w-full px-4">
        <h1 className="font-heading pt-12 text-2xl font-semibold">Склад</h1>
        <WarehouseHubNav />
        <ItemDataTable
          status="warehouse"
          showCheckboxes
          showExport
          showMoveAction
          showMassEdit
          emptyTitle="Нет товаров на складе"
          emptyDescription="Переведите товары из «Поступления» на склад, чтобы они отобразились здесь."
          emptyLink={{ to: "/items", label: "Перейти в поступления" }}
        />
      </div>
    </PullToRefresh>
  )
}

import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { ItemDataTable } from "@/components/Items/ItemDataTable.tsx"
import { pageNumberSearch } from "@/lib/routeSearch.ts"

const shipmentSearchSchema = z.object({
  page: pageNumberSearch,
  search: z.string().catch(""),
  category_id: z.string().catch(""),
  sort_by: z
    .enum(["title", "created_at", "quantity", "sku", "description", "unit"])
    .catch("created_at"),
  sort_order: z.enum(["asc", "desc"]).catch("desc"),
})

export const Route = createFileRoute("/_layout/shipment")({
  component: Shipment,
  validateSearch: (s) => shipmentSearchSchema.parse(s),
})

function Shipment() {
  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading pt-12 text-2xl font-semibold">Отгрузка</h1>
      <ItemDataTable
        status="shipment"
        showCheckboxes
        showExport
        emptyTitle="Нет товаров в отгрузке"
        emptyDescription="Переведите товары из раздела «Склад» в «Отгрузка», чтобы они отобразились здесь."
        emptyLink={{ to: "/warehouse", label: "Перейти на склад" }}
      />
    </div>
  )
}

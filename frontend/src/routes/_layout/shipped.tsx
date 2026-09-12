import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { ItemDataTable } from "@/components/Items/ItemDataTable.tsx"
import { pageNumberSearch } from "@/lib/routeSearch.ts"

const shippedSearchSchema = z.object({
  page: pageNumberSearch,
  search: z.string().catch(""),
  category_id: z.string().catch(""),
  sort_by: z
    .enum(["title", "created_at", "quantity", "sku", "description", "unit"])
    .catch("created_at"),
  sort_order: z.enum(["asc", "desc"]).catch("desc"),
})

export const Route = createFileRoute("/_layout/shipped")({
  component: Shipped,
  validateSearch: (s) => shippedSearchSchema.parse(s),
})

function Shipped() {
  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading pt-12 text-2xl font-semibold">Отгружено</h1>
      <ItemDataTable
        status="shipped"
        showExport
        emptyTitle="Нет отгруженных товаров"
      />
    </div>
  )
}

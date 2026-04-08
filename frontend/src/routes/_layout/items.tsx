import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { z } from "zod"

import { ItemsService } from "@/client/index.ts"
import { PullToRefresh } from "@/components/Common/PullToRefresh.tsx"
import AddItem from "@/components/Items/AddItem.tsx"
import EditItem from "@/components/Items/EditItem.tsx"
import { ItemDataTable } from "@/components/Items/ItemDataTable.tsx"

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
  search: z.string().catch(""),
  category_id: z.string().catch(""),
  created_at_from: z.string().catch(""),
  created_at_to: z.string().catch(""),
  sort_by: z
    .enum(["title", "created_at", "quantity", "sku", "description", "unit"])
    .catch("created_at"),
  sort_order: z.enum(["asc", "desc"]).catch("desc"),
  open: z.string().optional(),
})

type ItemsSearch = z.infer<typeof itemsSearchSchema>

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search),
})

function Items() {
  const searchParams = Route.useSearch() as ItemsSearch
  const navigate = useNavigate({ from: Route.fullPath })
  const openItemId = searchParams.open

  const { data: openItem } = useQuery({
    queryKey: ["item", openItemId],
    queryFn: () => ItemsService.readItem({ id: openItemId! }),
    enabled: Boolean(openItemId),
  })

  const queryClient = useQueryClient()

  const handleRefresh = useCallback(
    async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    [queryClient],
  )

  const clearOpenParam = useCallback(() => {
    ;(
      navigate as unknown as (opts: {
        search: (prev: ItemsSearch) => ItemsSearch
      }) => void
    )({
      search: (prev) => ({ ...prev, open: undefined }),
    })
  }, [navigate])

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto w-full max-w-full px-4">
        <h1 className="font-heading pt-12 text-2xl font-semibold">Поступления</h1>
        <AddItem />
        <ItemDataTable
          showCheckboxes
          showExport
          showMoveAction
          showMassEdit
          showPrintShippingNote
          showDateFilters
          emptyTitle="Нет добавленных слотов"
          emptyDescription="Добавьте слоты, чтобы они отображались здесь."
        />
        {openItem && (
          <EditItem
            item={openItem}
            open={true}
            onOpenChange={({ open }) => {
              if (!open) clearOpenParam()
            }}
          />
        )}
      </div>
    </PullToRefresh>
  )
}

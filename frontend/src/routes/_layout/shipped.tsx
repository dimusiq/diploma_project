import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { OutboundShipmentBoard } from "@/components/outbound/OutboundShipmentBoard.tsx"
import { pageNumberSearch } from "@/lib/routeSearch.ts"

const shippedSearchSchema = z.object({
  page: pageNumberSearch,
  search: z.string().catch(""),
})

export const Route = createFileRoute("/_layout/shipped")({
  component: Shipped,
  validateSearch: (s) => shippedSearchSchema.parse(s),
})

function Shipped() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">Отгружено</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Исходящие заказы, которые уже покинули склад.
      </p>
      <OutboundShipmentBoard stage="shipped" />
    </div>
  )
}

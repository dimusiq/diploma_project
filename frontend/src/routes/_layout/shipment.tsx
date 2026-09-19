import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { OutboundShipmentBoard } from "@/components/outbound/OutboundShipmentBoard.tsx"
import { pageNumberSearch } from "@/lib/routeSearch.ts"

const shipmentSearchSchema = z.object({
  page: pageNumberSearch,
  search: z.string().catch(""),
})

export const Route = createFileRoute("/_layout/shipment")({
  component: Shipment,
  validateSearch: (s) => shipmentSearchSchema.parse(s),
})

function Shipment() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">Отгрузка</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Исходящие заказы, готовые к физической отправке после комплектации и
        упаковки.
      </p>
      <OutboundShipmentBoard stage="ready" />
    </div>
  )
}

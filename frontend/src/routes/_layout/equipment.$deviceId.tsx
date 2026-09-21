import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { EquipmentDetailPage } from "@/components/fleet/EquipmentDetailPage.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { canAccessWarehouseSim } from "@/lib/warehouseSimAccess.ts"

export const Route = createFileRoute("/_layout/equipment/$deviceId")({
  component: EquipmentDetailRoute,
})

function EquipmentDetailRoute() {
  const { deviceId } = Route.useParams()
  const user = useCurrentUser()
  const navigate = useNavigate()
  return (
    <EquipmentDetailPage
      deviceId={deviceId}
      canManage={canAccessWarehouseSim(user)}
      onBack={() => {
        void navigate({ to: "/equipment" })
      }}
      onShowOnMap={(code) => {
        void navigate({
          to: "/digital-twin",
          search: { tab: "map", view: "2d", deviceId: code },
        })
      }}
      onShowEvents={(code) => {
        void navigate({
          to: "/digital-twin",
          search: { tab: "events", view: "2d", deviceId: code },
        })
      }}
      onShowWorkOrders={() => {
        void navigate({ to: "/technique/work-orders" })
      }}
    />
  )
}

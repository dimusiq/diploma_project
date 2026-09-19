import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FleetParkPage } from "@/components/fleet/FleetParkPage.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { canAccessWarehouseSim } from "@/lib/warehouseSimAccess.ts"

export const Route = createFileRoute("/_layout/equipment/")({
  component: EquipmentListRoute,
})

function EquipmentListRoute() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  return (
    <FleetParkPage
      canManage={canAccessWarehouseSim(user)}
      onOpenDevice={(device) => {
        void navigate({
          to: "/equipment/$deviceId",
          params: { deviceId: device.id },
        })
      }}
    />
  )
}

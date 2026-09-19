import { createFileRoute } from "@tanstack/react-router"
import { FleetParkPage } from "@/components/fleet/FleetParkPage.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { canAccessWarehouseSim } from "@/lib/warehouseSimAccess.ts"

export const Route = createFileRoute("/_layout/fleet")({
  component: FleetParkRoute,
})

function FleetParkRoute() {
  const user = useCurrentUser()
  return <FleetParkPage canManage={canAccessWarehouseSim(user)} />
}

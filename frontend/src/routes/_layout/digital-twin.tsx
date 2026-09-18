import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { DigitalTwinWorkspace } from "@/components/digitalTwin/DigitalTwinWorkspace.tsx"
import { digitalTwinSearchSchema } from "@/lib/digitalTwinSearch.ts"

export const Route = createFileRoute("/_layout/digital-twin")({
  validateSearch: (search) => digitalTwinSearchSchema.parse(search),
  component: DigitalTwinPage,
})

function DigitalTwinPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  useEffect(() => {
    deviceSimulation.autoStart()
  }, [])

  return (
    <DigitalTwinWorkspace
      tab={search.tab}
      view={search.view}
      onTabChange={(tab) => {
        void navigate({
          search: (prev: typeof search) => ({ ...prev, tab }),
        })
      }}
      onViewChange={(view) => {
        void navigate({
          search: (prev: typeof search) => ({ ...prev, view }),
        })
      }}
    />
  )
}

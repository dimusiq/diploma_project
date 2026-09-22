import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"
import { EventStreamPanel } from "@/components/deviceServer/EventStreamPanel.tsx"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { EventReplay } from "@/components/events/EventReplay.tsx"

const eventsSearchSchema = z.object({
  event: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/_layout/events")({
  validateSearch: (search) => eventsSearchSchema.parse(search),
  component: EventsPage,
})

function EventsPage() {
  const { event } = Route.useSearch()
  useEffect(() => {
    deviceSimulation.autoStart()
  }, [])

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-6 md:px-4 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">События</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        История склада и симуляции из PostgreSQL, дополненная живым потоком
        SSE. Управление runtime остаётся в Device Monitor.
      </p>
      <EventReplay />
      <EventStreamPanel
        variant="operator"
        persistHistory
        focusEventId={event ?? null}
      />
    </div>
  )
}

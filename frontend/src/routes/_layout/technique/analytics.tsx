import { createFileRoute } from "@tanstack/react-router"

import { ParkHealthAnalytics } from "@/components/Equipment/ParkHealthAnalytics.tsx"

export const Route = createFileRoute("/_layout/technique/analytics")({
  component: AnalyticsSection,
})

function AnalyticsSection() {
  return <ParkHealthAnalytics />
}

import { createFileRoute } from "@tanstack/react-router"

import { Dashboard } from "./dashboard.tsx"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

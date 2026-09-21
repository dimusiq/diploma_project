import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/technique/equipment/new")({
  beforeLoad: () => {
    throw redirect({ to: "/equipment" })
  },
  component: () => null,
})

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/warehouse-twin")({
  beforeLoad: () => {
    throw redirect({
      to: "/digital-twin",
      search: { tab: "analytics", view: "2d" },
    })
  },
})

import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/technique")({
  component: TechniqueLayout,
})

function TechniqueLayout() {
  return (
    <div className="mx-auto w-full max-w-full px-4">
      <Outlet />
    </div>
  )
}

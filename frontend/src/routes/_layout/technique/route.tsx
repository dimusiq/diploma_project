import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router"
import {
  isTechniqueTabActive,
  techniqueProcessHeading,
  techniqueSectionTabs,
} from "@/lib/techniqueNav.ts"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout/technique")({
  beforeLoad: ({ location }) => {
    const path = location.pathname.replace(/\/+$/, "") || "/"
    if (path === "/technique") {
      throw redirect({ to: "/equipment" })
    }
  },
  component: TechniqueLayout,
})

function TechniqueLayout() {
  const { pathname } = useLocation()
  const tabs = techniqueSectionTabs(pathname)
  const heading = techniqueProcessHeading(pathname)

  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading pt-12 text-2xl font-semibold">{heading}</h1>
      {tabs.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-2">
          {tabs.map((tab) => {
            const isActive = isTechniqueTabActive(tab.path, pathname)
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      ) : null}
      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  )
}

import {
  Link as RouterLink,
  useLocation,
} from "@tanstack/react-router"
import { cn } from "@/lib/utils.ts"

const HUB = [
  {
    to: "/warehouse",
    label: "Остатки",
    match: (p: string) => p === "/warehouse",
  },
  {
    to: "/warehouse-tasks",
    label: "Задания",
    match: (p: string) => p.startsWith("/warehouse-tasks"),
  },
  {
    to: "/digital-twin",
    label: "Digital Twin",
    match: (p: string) =>
      p.startsWith("/digital-twin") || p.startsWith("/warehouse-twin"),
  },
] as const

/** Общие вкладки склада: остатки, задания, Digital Twin. */
export function WarehouseHubNav() {
  const { pathname } = useLocation()
  return (
    <nav
      className="mb-4 flex flex-wrap gap-1 border-b border-border pb-2"
      aria-label="Разделы склада"
    >
      {HUB.map((item) => {
        const active = item.match(pathname)
        return (
          <RouterLink
            key={item.to}
            to={item.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </RouterLink>
        )
      })}
    </nav>
  )
}

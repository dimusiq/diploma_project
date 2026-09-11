import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout/technique")({
  component: TechniqueLayout,
})

const sections = [
  { id: "assets", label: "Список техники", path: "/technique" },
  { id: "maintenance", label: "График ТО", path: "/technique/maintenance" },
  { id: "maintenance-schedule", label: "Календарь ТО", path: "/technique/maintenance-schedule" },
  { id: "maintenance-settings", label: "Настройка ТО", path: "/technique/maintenance-settings" },
  { id: "work-orders", label: "Обслуживание и ремонт", path: "/technique/work-orders" },
  { id: "technicians", label: "Задачи техников", path: "/technique/technicians" },
  { id: "alerts", label: "Мониторинг", path: "/technique/alerts" },
  { id: "spare-parts", label: "Запасные части", path: "/technique/spare-parts" },
  { id: "analytics", label: "Аналитика", path: "/technique/analytics" },
  { id: "integrations", label: "Интеграции", path: "/technique/integrations" },
  { id: "security", label: "Безопасность", path: "/technique/security" },
  { id: "predictive", label: "Прогнозирование", path: "/technique/predictive" },
] as const

function TechniqueLayout() {
  const { pathname } = useLocation()

  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading pt-12 text-2xl font-semibold">Техника и оборудование</h1>
      <div className="mt-4 flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-2">
        {sections.map((s) => {
          const isActive =
            s.path === "/technique"
              ? pathname === "/technique" || pathname === "/technique/"
              : pathname === s.path || pathname.startsWith(`${s.path}/`)
          return (
            <Link
              key={s.id}
              to={s.path}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          )
        })}
      </div>
      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  )
}

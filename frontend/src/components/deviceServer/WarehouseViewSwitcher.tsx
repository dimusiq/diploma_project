import { Link as RouterLink } from "@tanstack/react-router"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils"

export type TwinViewMode = "2d" | "3d"

function SwitcherShell({ children }: { children: React.ReactNode }) {
  return (
    <fieldset className="m-0 inline-flex rounded-md border bg-background p-0.5">
      <legend className="sr-only">Представление склада</legend>
      {children}
    </fieldset>
  )
}

/** Переключатель 2D/3D в рамках одной страницы (состояние). */
export function WarehouseViewSwitcher({
  value,
  onChange,
}: {
  value: TwinViewMode
  onChange: (next: TwinViewMode) => void
}) {
  return (
    <SwitcherShell>
      <Button
        type="button"
        size="xs"
        variant={value === "2d" ? "default" : "ghost"}
        className={cn("min-w-12", value === "2d" && "pointer-events-none")}
        aria-pressed={value === "2d"}
        onClick={() => onChange("2d")}
      >
        2D
      </Button>
      <Button
        type="button"
        size="xs"
        variant={value === "3d" ? "default" : "ghost"}
        className={cn("min-w-12", value === "3d" && "pointer-events-none")}
        aria-pressed={value === "3d"}
        onClick={() => onChange("3d")}
      >
        3D
      </Button>
    </SwitcherShell>
  )
}

/** Единый маршрутный переключатель: 2D → Digital Twin (карта), 3D → /warehouse-3d. */
export function WarehouseViewRouteSwitcher({
  active,
}: {
  active: TwinViewMode
}) {
  return (
    <SwitcherShell>
      <Button
        asChild
        size="xs"
        variant={active === "2d" ? "default" : "ghost"}
        className="min-w-12"
      >
        <RouterLink
          to="/digital-twin"
          search={{ tab: "map", view: "2d" }}
          aria-pressed={active === "2d"}
          aria-current={active === "2d" ? "page" : undefined}
        >
          2D
        </RouterLink>
      </Button>
      <Button
        asChild
        size="xs"
        variant={active === "3d" ? "default" : "ghost"}
        className="min-w-12"
      >
        <RouterLink
          to="/warehouse-3d"
          aria-pressed={active === "3d"}
          aria-current={active === "3d" ? "page" : undefined}
        >
          3D
        </RouterLink>
      </Button>
    </SwitcherShell>
  )
}

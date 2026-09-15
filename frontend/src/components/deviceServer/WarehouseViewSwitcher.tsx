import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils"

export type TwinViewMode = "2d" | "3d"

export function WarehouseViewSwitcher({
  value,
  onChange,
}: {
  value: TwinViewMode
  onChange: (next: TwinViewMode) => void
}) {
  return (
    <fieldset className="m-0 inline-flex rounded-md border bg-background p-0.5">
      <legend className="sr-only">Представление склада</legend>
      <Button
        type="button"
        size="xs"
        variant={value === "2d" ? "default" : "ghost"}
        className={cn("min-w-12", value === "2d" && "pointer-events-none")}
        onClick={() => onChange("2d")}
      >
        2D
      </Button>
      <Button
        type="button"
        size="xs"
        variant={value === "3d" ? "default" : "ghost"}
        className={cn("min-w-12", value === "3d" && "pointer-events-none")}
        onClick={() => onChange("3d")}
      >
        3D
      </Button>
    </fieldset>
  )
}

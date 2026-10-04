import { Skeleton } from "@/components/ui/skeleton.tsx"
import { cn } from "@/lib/utils"

/** Скелетон списка/таблицы с фиксированной высотой — без скачка layout. */
export function ListLoadingBlock({
  rows = 5,
  rowClassName = "h-10",
  className,
  label = "Загрузка…",
}: {
  rows?: number
  rowClassName?: string
  className?: string
  label?: string
}) {
  return (
    <div
      className={cn("space-y-3", className)}
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("w-full", rowClassName)} />
      ))}
    </div>
  )
}

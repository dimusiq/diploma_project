import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils.ts"

/** Индикатор загрузки (аналог примеров AI Elements). */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2Icon
      className={cn("size-4 animate-spin text-muted-foreground", className)}
      aria-hidden
    />
  )
}

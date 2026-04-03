import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

const MB_MAP: Record<number, string> = {
  1: "mb-1",
  2: "mb-2",
  3: "mb-3",
  4: "mb-4",
}

export function FetchingIndicator({
  active,
  children = "Обновление…",
  minH = "20px",
  mb,
  className,
  ...props
}: Omit<ComponentProps<"p">, "children"> & {
  active: boolean
  children?: ReactNode
  minH?: string
  /** Chakra-style spacing index → Tailwind margin-bottom */
  mb?: number
}) {
  return (
    <p
      className={cn(
        "min-h-[1.25rem] text-sm text-muted-foreground",
        mb != null && MB_MAP[mb],
        active ? "visible" : "invisible",
        className,
      )}
      style={{ minHeight: minH }}
      {...props}
    >
      {children}
    </p>
  )
}

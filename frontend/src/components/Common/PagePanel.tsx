import type { ReactNode } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils"

export type PagePanelProps = {
  title?: string
  description?: string
  headerExtra?: ReactNode
  children: ReactNode
  className?: string
  /** Отступы в шкале как у Chakra spacing (например 4 → 1rem) */
  mt?: number
  mb?: number
}

export function PagePanel({
  title,
  description,
  headerExtra,
  children,
  className,
  mt,
  mb,
}: PagePanelProps) {
  const hasHeader = Boolean(title || description || headerExtra)
  return (
    <Card
      className={cn(
        mb === undefined && "mb-6",
        mt != null && `mt-${mt}`,
        mb != null && `mb-${mb}`,
        className,
      )}
    >
      {hasHeader ? (
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div className="min-w-0 space-y-1">
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </div>
          {headerExtra}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
    </Card>
  )
}

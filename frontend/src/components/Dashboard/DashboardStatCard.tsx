import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils"

interface DashboardStatCardProps {
  label: string
  value: string | number
  helpText?: string
  valueColor?: "info" | "success" | "warning" | "error" | "muted"
  icon?: ReactNode
}

const colorMap = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  muted: "text-muted-foreground",
} as const

const iconColorMap = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  muted: "text-muted-foreground",
} as const

export function DashboardStatCard({
  label,
  value,
  helpText,
  valueColor = "info",
  icon,
}: DashboardStatCardProps) {
  const color = colorMap[valueColor]
  const iconColor = iconColorMap[valueColor]
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        {icon && <div className={cn("text-xl", iconColor)}>{icon}</div>}
        <p className="text-lg font-bold">{label}</p>
        <p className={cn("text-2xl font-bold", color)}>{value}</p>
        {helpText && (
          <p className="text-sm text-muted-foreground">{helpText}</p>
        )}
      </CardContent>
    </Card>
  )
}

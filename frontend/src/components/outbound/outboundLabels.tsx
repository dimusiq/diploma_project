import { Badge } from "@/components/ui/badge.tsx"
import { getOrderStatusLabel } from "@/lib/statusLabels.ts"

const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  picking: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  packed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shipped: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export function outboundStatusBadge(status: string) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status] ?? ""}>
      {getOrderStatusLabel(status)}
    </Badge>
  )
}

export function stepLabel(done: boolean, doneText: string, pendingText: string) {
  return done ? `✓ ${doneText}` : pendingText
}

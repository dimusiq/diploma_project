import { type ReactNode } from "react"
import { FiRefreshCw } from "react-icons/fi"
import { usePullToRefresh } from "@/hooks/usePullToRefresh.ts"

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void
  children: ReactNode
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const { containerRef, indicatorRef } = usePullToRefresh({ onRefresh })

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-auto md:overflow-visible"
    >
      <div
        ref={indicatorRef}
        className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full opacity-0 transition-opacity"
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <FiRefreshCw className="size-5" />
        </div>
      </div>
      {children}
    </div>
  )
}

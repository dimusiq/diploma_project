import type { ReactNode } from "react"
import { ErrorBoundary } from "react-error-boundary"

import { ErrorFallback } from "@/components/Common/ErrorFallback.tsx"

/** Error boundary уровня секции/виджета — не валит всю страницу. */
export function SectionErrorBoundary({
  children,
  title,
}: {
  children: ReactNode
  /** Подпись секции для сообщения об ошибке (пока не прокидывается в fallback) */
  title?: string
}) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Повторный рендер секции; данные подтянет React Query.
      }}
      resetKeys={title ? [title] : undefined}
    >
      {children}
    </ErrorBoundary>
  )
}

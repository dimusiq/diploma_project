import { type FallbackProps } from "react-error-boundary"
import { FiAlertTriangle } from "react-icons/fi"
import { Button } from "@/components/ui/button.tsx"

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <FiAlertTriangle className="size-10 text-destructive" />
      <div>
        <h3 className="mb-1 text-lg font-semibold">Произошла ошибка</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Компонент не удалось отрисовать. Попробуйте обновить или обратитесь к администратору.
        </p>
        {message && (
          <p className="mt-2 max-w-md truncate text-xs text-muted-foreground/70">{message}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
        Попробовать снова
      </Button>
    </div>
  )
}

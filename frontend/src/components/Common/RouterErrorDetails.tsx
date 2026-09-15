import { useState } from "react"
import { Button } from "@/components/ui/button.tsx"

function errorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  return null
}

/** Детали ошибки маршрута (вместо англ. ErrorComponent из TanStack Router). */
export function RouterErrorDetails({ error }: { error: unknown }) {
  const [show, setShow] = useState(process.env.NODE_ENV !== "production")
  const message = errorMessage(error)

  if (!message) return null

  return (
    <div className="mt-2 w-full max-w-md text-left">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShow((v) => !v)}
      >
        {show ? "Скрыть ошибку" : "Показать ошибку"}
      </Button>
      {show ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left text-xs text-destructive">
          <code>{message}</code>
        </pre>
      ) : null}
    </div>
  )
}

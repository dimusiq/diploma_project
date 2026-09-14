/**
 * Расширения (Grammarly, переводчики и т.д.) иногда отклоняют промисы в контексте страницы
 * объектом вида { httpError: false, httpStatus: 200, code: 403, name: 'n' } — это не API приложения.
 */
export function isLikelyBrowserExtensionRejection(reason: unknown): boolean {
  if (reason == null) return false
  if (typeof reason === "string") {
    return /message channel closed|asynchronous response/i.test(reason)
  }
  if (reason instanceof Error) {
    return /message channel closed|asynchronous response/i.test(reason.message)
  }
  if (typeof reason !== "object") return false
  const o = reason as Record<string, unknown>
  if (typeof o.message === "string" && /message channel closed/i.test(o.message)) {
    return true
  }
  if (o.code === 403 && o.httpStatus === 200) {
    return true
  }
  return (
    o.httpError === false &&
    typeof o.httpStatus === "number" &&
    typeof o.code === "number"
  )
}

export function isAbortError(reason: unknown): boolean {
  if (reason == null || typeof reason !== "object") return false
  const name = (reason as { name?: unknown }).name
  return name === "AbortError"
}

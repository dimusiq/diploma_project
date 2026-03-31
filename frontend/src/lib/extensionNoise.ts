/**
 * Расширения (Grammarly, переводчики и т.д.) иногда отклоняют промисы в контексте страницы
 * объектом вида { httpError: false, httpStatus: 200, code: 403, name: 'n' } — это не API приложения.
 */
export function isLikelyBrowserExtensionRejection(reason: unknown): boolean {
  if (reason === null || typeof reason !== "object") return false
  const o = reason as Record<string, unknown>
  if (o.code === 403 && o.httpStatus === 200) {
    return true
  }
  return (
    o.httpError === false &&
    typeof o.httpStatus === "number" &&
    typeof o.code === "number"
  )
}

const DEFAULT_LENGTH = 8

function shortId(id: string, length: number = DEFAULT_LENGTH): string {
  if (!id || id.length <= length) return id
  return id.slice(-length)
}

interface ShortIdProps {
  id: string
  length?: number
}

/**
 * Показывает короткий ID (по умолчанию последние 8 символов).
 * Полный ID отображается в title при наведении.
 */
export function ShortId({ id, length = DEFAULT_LENGTH }: ShortIdProps) {
  return <span title={id}>{shortId(id, length)}</span>
}

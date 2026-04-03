/** Лимит тела `message` на POST /api/v1/agent/chat (см. AgentChatRequest). */
export const AGENT_CHAT_MESSAGE_MAX = 8000

function looksLikeTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true
  return /\.(txt|md|csv|json|log|xml|yaml|yml|ts|tsx|js|jsx|py|sql|env|ini|cfg)$/i.test(
    file.name,
  )
}

/**
 * Собирает итоговую строку для агента: текст пользователя + содержимое текстовых вложений.
 * Бинарные файлы только упоминаются по имени и размеру.
 */
export async function buildAgentMessageWithFiles(
  userText: string,
  files: File[],
): Promise<string> {
  const trimmed = userText.trim()
  const blocks: string[] = []
  if (trimmed) blocks.push(trimmed)

  for (const file of files) {
    if (file.size > 600_000) {
      blocks.push(
        `\n\n[Файл «${file.name}» пропущен: размер ${file.size} байт (лимит ~600 КБ для вставки в чат).]`,
      )
      continue
    }
    if (looksLikeTextFile(file)) {
      try {
        const t = await file.text()
        const cap = 4000
        const body = t.length > cap ? `${t.slice(0, cap)}\n… [обрезано]` : t
        blocks.push(`\n\n--- Файл «${file.name}» ---\n${body}`)
      } catch {
        blocks.push(`\n\n[Файл «${file.name}» не прочитан как текст.]`)
      }
    } else {
      blocks.push(
        `\n\n[Вложение «${file.name}» (${file.type || "бинарные данные"}, ${file.size} байт) — содержимое не вставлено; опишите запрос текстом при необходимости.]`,
      )
    }
  }

  let out = blocks.join("")
  if (out.length > AGENT_CHAT_MESSAGE_MAX) {
    out = `${out.slice(0, AGENT_CHAT_MESSAGE_MAX - 20)}\n… [обрезано до ${AGENT_CHAT_MESSAGE_MAX} симв.]`
  }
  return out
}

export function formatUserMessagePreview(text: string, files: File[]): string {
  const t = text.trim()
  if (t && files.length)
    return `${t}\n\n— Вложения: ${files.map((f) => f.name).join(", ")}`
  if (t) return t
  if (files.length) return `Вложения: ${files.map((f) => f.name).join(", ")}`
  return ""
}

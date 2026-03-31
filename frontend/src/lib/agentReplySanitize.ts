/** Убирает служебные строки «Запуск: <uuid>» из текста ответа (в т.ч. в старых сообщениях из БД). */
const RUN_ID_LINE_RE =
  /^\s*(?:Запуск|Run)(?:\s+[Ii]d)?\s*:\s*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\s*$/gim

export function sanitizeAssistantChatContent(text: string): string {
  if (!text) return text
  const cleaned = text.replace(RUN_ID_LINE_RE, "")
  return cleaned.replace(/\n{3,}/g, "\n\n").trim()
}

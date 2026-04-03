/** Убирает служебные строки «Запуск: <uuid>» из текста ответа (в т.ч. в старых сообщениях из БД). */
const RUN_ID_LINE_RE =
  /^\s*(?:Запуск|Run)(?:\s+[Ii]d)?\s*:\s*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\s*$/gim

const ANSWER_BLOCK_RE = /<answer\s*>\s*([\s\S]*?)\s*<\/answer\s*>/gi

function extractAnswerInnerOrFull(text: string): string {
  let last: string | null = null
  ANSWER_BLOCK_RE.lastIndex = 0
  for (const m of text.matchAll(ANSWER_BLOCK_RE)) {
    const inner = m[1]?.trim()
    if (inner) last = inner
  }
  if (last) return last
  const lower = text.toLowerCase()
  if (lower.includes("</answer>")) {
    const endIdx = lower.lastIndexOf("</answer>")
    const before = text.slice(0, endIdx)
    const openRe = /<answer\s*>/gi
    let start = -1
    for (const om of before.matchAll(openRe)) {
      start = om.index + om[0].length
    }
    if (start >= 0) {
      const inner = before.slice(start).trim()
      if (inner) return inner
    }
    const paras = before
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (paras.length) return paras[paras.length - 1]!
    return before.trim()
  }
  return text.trim()
}

export function sanitizeAssistantChatContent(text: string): string {
  if (!text) return text
  const core = extractAnswerInnerOrFull(text)
  const cleaned = core.replace(RUN_ID_LINE_RE, "")
  return cleaned.replace(/\n{3,}/g, "\n\n").trim()
}

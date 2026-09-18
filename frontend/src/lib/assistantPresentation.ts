import type { AgentPublicReasoningSummary } from "@/api/agent.ts"
import { sanitizeAssistantChatContent } from "@/lib/agentReplySanitize.ts"

const SOURCE_LABELS: Record<string, string> = {
  operational_state_warehouse_context: "Состояние склада",
  twin_queue_depth_projections: "Очереди цифрового двойника",
  historical_domain_events_metrics: "История событий",
  agent_knowledge_rag: "База знаний",
}

const FAILURE_SNIPPETS = [
  "не удалось стабильно",
  "не удалось получить ответ",
  "не удалось сгенерировать",
  "повторите запрос",
]

export function isAssistantFailureReply(text: string): boolean {
  const t = sanitizeAssistantChatContent(text).toLowerCase()
  if (!t) return false
  return FAILURE_SNIPPETS.some((s) => t.includes(s))
}

export function humanizeDataSource(raw: string): string | null {
  const key = raw.split("(")[0]?.trim() ?? raw
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key]
  if (!key) return null
  if (/^[a-z][a-z0-9_]*$/i.test(key)) return null
  const trimmed = raw.trim()
  return trimmed || null
}

export type UserFacingReasoning = {
  brief: string | null
  sources: string[]
  recommendation: string | null
  nextSteps: string | null
  confidence: string | null
}

export function formatPublicReasoningForUser(
  pr: AgentPublicReasoningSummary,
  replyText?: string,
): UserFacingReasoning | null {
  const brief = sanitizeAssistantChatContent(pr.brief_explanation)
  const reply = replyText
    ? sanitizeAssistantChatContent(replyText)
    : ""
  const briefUseful =
    brief &&
    brief !== "—" &&
    (!reply || brief !== reply) &&
    !/^см\.?\s+ответ/i.test(brief)
      ? brief
      : null
  const recommendation = sanitizeAssistantChatContent(
    pr.recommendation ?? "",
  )
  const recommendationUseful =
    recommendation &&
    recommendation !== "—" &&
    !/^см\.?\s+ответ/i.test(recommendation)
      ? recommendation
      : null
  const next = (pr.next_steps ?? "").trim()
  const nextSteps = next && next !== "—" ? next : null
  const confidence = (pr.confidence ?? "").trim() || null
  const sources = [
    ...new Set(
      (pr.data_sources ?? [])
        .map(humanizeDataSource)
        .filter((s): s is string => Boolean(s)),
    ),
  ]
  const failed = Boolean(reply && isAssistantFailureReply(reply))

  if (
    !briefUseful &&
    sources.length === 0 &&
    !recommendationUseful &&
    !nextSteps &&
    !confidence
  ) {
    return null
  }

  if (failed) {
    if (sources.length === 0) return null
    return {
      brief: null,
      sources,
      recommendation: null,
      nextSteps: null,
      confidence: null,
    }
  }

  return {
    brief: briefUseful,
    sources,
    recommendation: recommendationUseful,
    nextSteps,
    confidence,
  }
}

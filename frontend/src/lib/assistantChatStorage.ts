import type { AgentPublicReasoningSummary } from "@/api/agent.ts"

/** Сообщение в UI чата ассистента (история с сервера + локальный стрим). */
export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string
      role: "assistant"
      content: string
      llmAvailable: boolean
      model: string | null
      publicReasoning?: AgentPublicReasoningSummary
      runId?: string | null
    }

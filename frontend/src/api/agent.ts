import { request } from "@/lib/apiClient.ts"

export interface AgentPublicReasoningSummary {
  brief_explanation: string
  tools_used: Array<Record<string, string>>
  data_sources: string[]
  recommendation: string
  models: Record<string, string>
  main_loop_task: string
}

export interface AgentChatResponse {
  reply: string
  ollama_available: boolean
  model: string | null
  public_reasoning: AgentPublicReasoningSummary
  reasoning_debug?: Record<string, unknown> | null
  run_id?: string | null
}

export interface AgentPermissionsResponse {
  can_use: boolean
}

export async function fetchAgentPermissions(): Promise<AgentPermissionsResponse> {
  return request<AgentPermissionsResponse>("/api/v1/agent/permissions")
}

export function postAgentChat(
  message: string,
  options?: { includeReasoningDebug?: boolean },
): Promise<AgentChatResponse> {
  return request<AgentChatResponse>("/api/v1/agent/chat", {
    method: "POST",
    body: {
      message,
      include_reasoning_debug: options?.includeReasoningDebug === true,
    },
  })
}

export interface AgentRunDetail {
  id: string
  user_id: string
  agent_chat_log_id: string
  created_at: string
  ollama_available: boolean
  model: string | null
  steps: Array<Record<string, unknown>>
  public_reasoning: Record<string, unknown> | null
}

export function fetchAgentRun(runId: string): Promise<AgentRunDetail> {
  return request<AgentRunDetail>(`/api/v1/agent/runs/${runId}`)
}

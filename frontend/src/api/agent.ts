import { request } from "@/lib/apiClient.ts"

export interface AgentPublicReasoningSummary {
  brief_explanation: string
  tools_used: Array<Record<string, string>>
  data_sources: string[]
  recommendation: string
  models: Record<string, string>
  main_loop_task: string
  /** Промежуточные абзацы ответа (между кратким итогом и финальной рекомендацией). */
  next_steps?: string
  /** Эвристика после verify инструментов. */
  confidence?: string
  /** Если вызывались propose/act. */
  kpi_effect?: string | null
  /** Путь к таймлайну запуска (совпадает с run_id). */
  run_log_ref?: string | null
  /** Кратко по фазам Observe→Reason→Act→Verify→Conclude. */
  operational_cycle?: Record<string, string>
}

export interface AgentChatResponse {
  reply: string
  llm_available: boolean
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
  llm_available: boolean
  model: string | null
  steps: Array<Record<string, unknown>>
  public_reasoning: Record<string, unknown> | null
}

export function fetchAgentRun(runId: string): Promise<AgentRunDetail> {
  return request<AgentRunDetail>(`/api/v1/agent/runs/${runId}`)
}

export interface AgentPolicyPublic {
  id: string
  code: string
  title: string
  rules: Record<string, unknown>
  updated_at: string
}

export interface AgentPolicyListResponse {
  data: AgentPolicyPublic[]
  count: number
}

export async function fetchAgentPolicies(): Promise<AgentPolicyListResponse> {
  return request<AgentPolicyListResponse>("/api/v1/agent/policies")
}

export async function updateAgentPolicy(
  code: string,
  body: { title?: string; rules?: Record<string, unknown> },
): Promise<AgentPolicyPublic> {
  return request<AgentPolicyPublic>(`/api/v1/agent/policies/${encodeURIComponent(code)}`, {
    method: "PUT",
    body,
  })
}

export interface AgentRunListResponse {
  data: AgentRunDetail[]
  count: number
}

export async function fetchAgentRuns(
  skip = 0,
  limit = 30,
): Promise<AgentRunListResponse> {
  const q = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  })
  return request<AgentRunListResponse>(`/api/v1/agent/runs?${q.toString()}`)
}

import { request } from "@/lib/apiClient.ts"

export interface AgentPublicReasoningSummary {
  brief_explanation: string
  tools_used: Array<Record<string, string>>
  data_sources: string[]
  recommendation: string
  models: Record<string, string>
  main_loop_task: string
  next_steps?: string
  confidence?: string
  kpi_effect?: string | null
  run_log_ref?: string | null
  operational_cycle?: Record<string, string>
}

export interface AgentChatResponse {
  reply: string
  llm_available: boolean
  model?: string | null
  public_reasoning?: AgentPublicReasoningSummary | null
  reasoning_debug?: Record<string, unknown> | null
  run_id?: string | null
}

export interface AgentPermissionsResponse {
  can_use: boolean
}

export async function fetchAgentPermissions(): Promise<AgentPermissionsResponse> {
  return request<AgentPermissionsResponse>("/api/v1/agent/permissions")
}

export async function postAgentChat(
  message: string,
  options?: {
    includeReasoningDebug?: boolean
    userChatId?: string
    includePublicReasoning?: boolean
  },
): Promise<AgentChatResponse> {
  const wantReasoning = options?.includePublicReasoning === true
  const data = await request<AgentChatResponse>("/api/v1/agent/chat", {
    method: "POST",
    body: {
      message,
      include_reasoning_debug: options?.includeReasoningDebug === true,
      user_chat_id: options?.userChatId ?? null,
      include_public_reasoning: wantReasoning,
    },
  })
  if (!wantReasoning && data.public_reasoning != null) {
    const { public_reasoning: _omit, ...rest } = data
    return rest as AgentChatResponse
  }
  return data
}

export interface AgentUserChatPublic {
  id: string
  title: string
  updated_at: string
}

export interface AgentUserChatMessagePublic {
  id: string
  role: string
  content: string
  seq: number
  assistant_meta: Record<string, unknown> | null
}

export interface AgentUserChatDetailPublic {
  id: string
  title: string
  created_at: string
  updated_at: string
  messages: AgentUserChatMessagePublic[]
}

export interface AgentUserChatListResponse {
  data: AgentUserChatPublic[]
  count: number
}

export async function fetchUserAssistantChats(): Promise<AgentUserChatListResponse> {
  return request<AgentUserChatListResponse>("/api/v1/agent/user-chats")
}

export async function createUserAssistantChat(): Promise<AgentUserChatPublic> {
  return request<AgentUserChatPublic>("/api/v1/agent/user-chats", {
    method: "POST",
  })
}

export async function fetchUserAssistantChat(
  chatId: string,
): Promise<AgentUserChatDetailPublic> {
  return request<AgentUserChatDetailPublic>(
    `/api/v1/agent/user-chats/${encodeURIComponent(chatId)}`,
  )
}

export async function deleteUserAssistantChat(chatId: string): Promise<void> {
  await request<void>(
    `/api/v1/agent/user-chats/${encodeURIComponent(chatId)}`,
    {
      method: "DELETE",
    },
  )
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
  return request<AgentPolicyPublic>(
    `/api/v1/agent/policies/${encodeURIComponent(code)}`,
    {
      method: "PUT",
      body,
    },
  )
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

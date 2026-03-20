import { request } from "@/lib/apiClient.ts"

export interface AgentChatResponse {
  reply: string
  ollama_available: boolean
  model: string | null
}

export interface AgentPermissionsResponse {
  can_use: boolean
}

export async function fetchAgentPermissions(): Promise<AgentPermissionsResponse> {
  return request<AgentPermissionsResponse>("/api/v1/agent/permissions")
}

export function postAgentChat(message: string): Promise<AgentChatResponse> {
  return request<AgentChatResponse>("/api/v1/agent/chat", {
    method: "POST",
    body: { message },
  })
}

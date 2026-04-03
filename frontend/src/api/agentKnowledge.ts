import { request } from "@/lib/apiClient.ts"

export interface AgentKnowledgeChunkAdmin {
  id: string
  source: string
  title: string
  content: string
  created_at: string
  embedding_ready: boolean
}

export interface AgentKnowledgeList {
  data: AgentKnowledgeChunkAdmin[]
  count: number
}

const BASE = "/api/v1/agent/knowledge"

export const agentKnowledgeApi = {
  list: (skip = 0, limit = 100) =>
    request<AgentKnowledgeList>(`${BASE}/chunks?skip=${skip}&limit=${limit}`),

  create: (
    body: { title: string; content: string; source?: string },
    reindex = true,
  ) =>
    request<AgentKnowledgeChunkAdmin>(`${BASE}/chunks?reindex=${reindex}`, {
      method: "POST",
      body,
    }),

  update: (
    id: string,
    body: Partial<{ title: string; content: string; source: string }>,
    reindex = true,
  ) =>
    request<AgentKnowledgeChunkAdmin>(
      `${BASE}/chunks/${id}?reindex=${reindex}`,
      { method: "PATCH", body },
    ),

  remove: (id: string) =>
    request<{ message: string }>(`${BASE}/chunks/${id}`, { method: "DELETE" }),

  reindexOne: (id: string) =>
    request<AgentKnowledgeChunkAdmin>(`${BASE}/chunks/${id}/reindex`, {
      method: "POST",
    }),

  reindexAll: () =>
    request<{ success: number; failed: number }>(`${BASE}/chunks/reindex-all`, {
      method: "POST",
    }),
}

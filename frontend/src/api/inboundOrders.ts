import { request } from "@/lib/apiClient.ts"

export interface InboundOrderPublic {
  id: string
  warehouse_id: string
  code: string
  shipment_id: string | null
  status: string
  expected_at: string | null
  lines: Record<string, unknown> | null
  extra: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface InboundOrderList {
  data: InboundOrderPublic[]
  count: number
}

export interface InboundOrderCreate {
  code: string
  warehouse_id?: string | null
  shipment_id?: string | null
  status?: string
  expected_at?: string | null
  lines?: Record<string, unknown> | null
  extra?: Record<string, unknown> | null
}

export interface InboundOrderUpdate {
  code?: string
  status?: string
  expected_at?: string | null
  shipment_id?: string | null
  lines?: Record<string, unknown> | null
  extra?: Record<string, unknown> | null
}

export const inboundOrdersApi = {
  list: (params?: { skip?: number; limit?: number; status?: string }) => {
    const sp = new URLSearchParams()
    if (params?.status) sp.set("status", params.status)
    if (params?.skip != null) sp.set("skip", String(params.skip))
    if (params?.limit != null) sp.set("limit", String(params.limit))
    const q = sp.toString()
    return request<InboundOrderList>(
      `/api/v1/inbound-orders/${q ? `?${q}` : ""}`,
    )
  },
  get: (id: string) =>
    request<InboundOrderPublic>(`/api/v1/inbound-orders/${id}`),
  create: (body: InboundOrderCreate) =>
    request<InboundOrderPublic>("/api/v1/inbound-orders/", {
      method: "POST",
      body,
    }),
  update: (id: string, body: InboundOrderUpdate) =>
    request<InboundOrderPublic>(`/api/v1/inbound-orders/${id}`, {
      method: "PATCH",
      body,
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/inbound-orders/${id}`, {
      method: "DELETE",
    }),
}

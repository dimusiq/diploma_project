import { request } from "@/lib/apiClient.ts"

export interface OutboundOrderPublic {
  id: string
  warehouse_id: string
  code: string
  shipment_id: string | null
  status: string
  ship_by_at: string | null
  lines: Record<string, unknown> | null
  extra: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface OutboundOrderList {
  data: OutboundOrderPublic[]
  count: number
}

export interface OutboundOrderCreate {
  code: string
  warehouse_id?: string | null
  shipment_id?: string | null
  status?: string
  ship_by_at?: string | null
  lines?: Record<string, unknown> | null
  extra?: Record<string, unknown> | null
}

export interface OutboundOrderUpdate {
  code?: string
  status?: string
  ship_by_at?: string | null
  shipment_id?: string | null
  lines?: Record<string, unknown> | null
  extra?: Record<string, unknown> | null
}

export const outboundOrdersApi = {
  list: (params?: { skip?: number; limit?: number; status?: string }) => {
    const sp = new URLSearchParams()
    if (params?.status) sp.set("status", params.status)
    if (params?.skip != null) sp.set("skip", String(params.skip))
    if (params?.limit != null) sp.set("limit", String(params.limit))
    const q = sp.toString()
    return request<OutboundOrderList>(
      `/api/v1/outbound-orders/${q ? `?${q}` : ""}`,
    )
  },
  get: (id: string) =>
    request<OutboundOrderPublic>(`/api/v1/outbound-orders/${id}`),
  create: (body: OutboundOrderCreate) =>
    request<OutboundOrderPublic>("/api/v1/outbound-orders/", {
      method: "POST",
      body,
    }),
  update: (id: string, body: OutboundOrderUpdate) =>
    request<OutboundOrderPublic>(`/api/v1/outbound-orders/${id}`, {
      method: "PATCH",
      body,
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/outbound-orders/${id}`, {
      method: "DELETE",
    }),
}

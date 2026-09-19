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

export interface OutboundFulfillmentPublic extends OutboundOrderPublic {
  customer: string | null
  items_count: number
  total_quantity: number
  pallets_count: number
  picking_status: "pending" | "complete" | string
  packing_status: "pending" | "complete" | string
  ready_at: string | null
  transport_id: string | null
  transport_label: string | null
  transport_status: string | null
  transport_assigned: boolean
}

export interface OutboundFulfillmentList {
  data: OutboundFulfillmentPublic[]
  count: number
  ready_count: number
  items_count: number
  pallets_count: number
  awaiting_transport: number
}

export interface OutboundLineView {
  sku_id: string | null
  pallets: number
  picked: number
  quantity: number
}

export interface OutboundTaskView {
  id: string
  task_type: string
  status: string
  updated_at: string
}

export interface OutboundLinkedItem {
  id: string
  sku: string | null
  title: string
  status: string
  quantity: number
}

export interface OutboundTimelineEvent {
  at: string
  kind: string
  label: string
}

export interface OutboundFulfillmentDetail extends OutboundFulfillmentPublic {
  line_items: OutboundLineView[]
  tasks: OutboundTaskView[]
  items: OutboundLinkedItem[]
  timeline: OutboundTimelineEvent[]
}

export type OutboundBoardParams = {
  skip?: number
  limit?: number
  search?: string
  customer?: string
  transport?: "assigned" | "unassigned" | ""
  ready_date?: string
}

function boardQuery(params?: OutboundBoardParams): string {
  const sp = new URLSearchParams()
  if (params?.search) sp.set("search", params.search)
  if (params?.customer) sp.set("customer", params.customer)
  if (params?.transport) sp.set("transport", params.transport)
  if (params?.ready_date) sp.set("ready_date", params.ready_date)
  if (params?.skip != null) sp.set("skip", String(params.skip))
  if (params?.limit != null) sp.set("limit", String(params.limit))
  const q = sp.toString()
  return q ? `?${q}` : ""
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
  listReady: (params?: OutboundBoardParams) =>
    request<OutboundFulfillmentList>(
      `/api/v1/outbound-orders/ready-for-shipment${boardQuery(params)}`,
    ),
  listShippedBoard: (params?: OutboundBoardParams) =>
    request<OutboundFulfillmentList>(
      `/api/v1/outbound-orders/shipped-board${boardQuery(params)}`,
    ),
  get: (id: string) =>
    request<OutboundOrderPublic>(`/api/v1/outbound-orders/${id}`),
  getFulfillment: (id: string) =>
    request<OutboundFulfillmentDetail>(
      `/api/v1/outbound-orders/${id}/fulfillment`,
    ),
  ship: (id: string) =>
    request<OutboundFulfillmentDetail>(`/api/v1/outbound-orders/${id}/ship`, {
      method: "POST",
    }),
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

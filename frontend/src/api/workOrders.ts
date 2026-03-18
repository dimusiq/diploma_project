/**
 * API заявок на обслуживание и ремонт техники (Work Order).
 */

import { request } from "@/lib/apiClient.ts"

export const WORK_ORDER_STATUSES = [
  "open",
  "in_progress",
  "waiting_parts",
  "done",
  "canceled",
] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Открыта",
  in_progress: "В работе",
  waiting_parts: "Ожидание запчастей",
  done: "Выполнена",
  canceled: "Отменена",
}

export const WORK_ORDER_PRIORITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number]

export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
}

export const ATTACHMENT_KINDS = [
  "before_photo",
  "after_photo",
  "attachment",
] as const

export interface WorkOrderPublic {
  id: string
  equipment_id: string
  equipment_name: string | null
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to_id: string | null
  assigned_to_email: string | null
  start_at: string | null
  end_at: string | null
  due_at: string | null
  created_by_id: string | null
  created_at: string
  updated_at: string
}

export interface WorkOrderStatusHistoryPublic {
  id: string
  work_order_id: string
  from_status: string | null
  to_status: string
  changed_by_id: string | null
  changed_by_email: string | null
  comment: string | null
  created_at: string
}

export interface WorkOrderCommentPublic {
  id: string
  work_order_id: string
  user_id: string
  user_email: string | null
  body: string
  created_at: string
}

export interface WorkOrderChecklistItemPublic {
  id: string
  work_order_id: string
  title: string
  sort_order: number
  completed: boolean
}

export interface WorkOrderAttachmentPublic {
  id: string
  work_order_id: string
  file_path: string
  filename: string | null
  kind: string
  created_at: string
}

export interface WorkOrderPartReservationPublic {
  id: string
  work_order_id: string
  spare_part_id: string
  spare_part_title: string | null
  spare_part_sku: string | null
  quantity: number
  created_at: string
}

export interface WorkOrderPartConsumptionPublic {
  id: string
  work_order_id: string
  spare_part_id: string
  spare_part_title: string | null
  spare_part_sku: string | null
  quantity: number
  consumed_at: string
}

export interface WorkOrderDetailPublic extends WorkOrderPublic {
  status_history: WorkOrderStatusHistoryPublic[]
  comments: WorkOrderCommentPublic[]
  checklist_items: WorkOrderChecklistItemPublic[]
  attachments: WorkOrderAttachmentPublic[]
  part_reservations?: WorkOrderPartReservationPublic[]
  part_consumptions?: WorkOrderPartConsumptionPublic[]
}

export interface WorkOrderCreate {
  equipment_id: string
  title: string
  description?: string | null
  priority?: string
  assigned_to_id?: string | null
  start_at?: string | null
  end_at?: string | null
  due_at?: string | null
}

export interface WorkOrderUpdate {
  title?: string
  description?: string | null
  status?: string
  status_comment?: string | null
  priority?: string
  assigned_to_id?: string | null
  start_at?: string | null
  end_at?: string | null
  due_at?: string | null
}

export interface WorkOrderCommentCreate {
  body: string
}

export interface WorkOrderChecklistItemCreate {
  title: string
  sort_order?: number
}

export interface WorkOrderChecklistItemUpdate {
  title?: string
  completed?: boolean
  sort_order?: number
}

export interface WorkOrderAttachmentCreate {
  file_path: string
  filename?: string | null
  kind?: string
}

export interface WorkOrderListResponse {
  data: WorkOrderPublic[]
  count: number
}

export const workOrdersApi = {
  list: (params?: {
    skip?: number
    limit?: number
    status?: string
    assigned_to_id?: string
    priority?: string
    equipment_id?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.skip != null) q.set("skip", String(params.skip))
    if (params?.limit != null) q.set("limit", String(params.limit))
    if (params?.status) q.set("status", params.status)
    if (params?.assigned_to_id) q.set("assigned_to_id", params.assigned_to_id)
    if (params?.priority) q.set("priority", params.priority)
    if (params?.equipment_id) q.set("equipment_id", params.equipment_id)
    const query = q.toString()
    return request<WorkOrderListResponse>(
      `/api/v1/work-orders${query ? `?${query}` : ""}`,
    )
  },

  events: (params: { from: string; to: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams()
    q.set("from", params.from)
    q.set("to", params.to)
    if (params.skip != null) q.set("skip", String(params.skip))
    if (params.limit != null) q.set("limit", String(params.limit))
    return request<WorkOrderListResponse>(`/api/v1/work-orders/events?${q.toString()}`)
  },

  createFromMaintenanceEvent: (body: {
    equipment_id: string
    interval_hours: number | null
    start_at: string
    end_at: string
    assigned_to_id?: string | null
    title?: string | null
    description?: string | null
  }) =>
    request<WorkOrderDetailPublic>(
      `/api/v1/work-orders/from-maintenance-event`,
      {
        method: "POST",
        body,
      },
    ),

  get: (id: string) =>
    request<WorkOrderDetailPublic>(`/api/v1/work-orders/${id}`),

  create: (body: WorkOrderCreate) =>
    request<WorkOrderPublic>("/api/v1/work-orders", {
      method: "POST",
      body,
    }),

  update: (id: string, body: WorkOrderUpdate) =>
    request<WorkOrderPublic>(`/api/v1/work-orders/${id}`, {
      method: "PUT",
      body,
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/work-orders/${id}`, {
      method: "DELETE",
    }),

  addComment: (id: string, body: WorkOrderCommentCreate) =>
    request<WorkOrderCommentPublic>(`/api/v1/work-orders/${id}/comments`, {
      method: "POST",
      body,
    }),

  getChecklist: (id: string) =>
    request<WorkOrderChecklistItemPublic[]>(
      `/api/v1/work-orders/${id}/checklist`,
    ),

  addChecklistItem: (id: string, body: WorkOrderChecklistItemCreate) =>
    request<WorkOrderChecklistItemPublic>(
      `/api/v1/work-orders/${id}/checklist`,
      { method: "POST", body },
    ),

  updateChecklistItem: (
    id: string,
    itemId: string,
    body: WorkOrderChecklistItemUpdate,
  ) =>
    request<WorkOrderChecklistItemPublic>(
      `/api/v1/work-orders/${id}/checklist/${itemId}`,
      { method: "PATCH", body },
    ),

  deleteChecklistItem: (id: string, itemId: string) =>
    request<{ message: string }>(
      `/api/v1/work-orders/${id}/checklist/${itemId}`,
      { method: "DELETE" },
    ),

  addAttachment: (id: string, body: WorkOrderAttachmentCreate) =>
    request<WorkOrderAttachmentPublic>(
      `/api/v1/work-orders/${id}/attachments`,
      { method: "POST", body },
    ),

  listPartReservations: (id: string) =>
    request<WorkOrderPartReservationPublic[]>(
      `/api/v1/work-orders/${id}/part-reservations`,
    ),

  addPartReservation: (
    id: string,
    body: { spare_part_id: string; quantity: number },
  ) =>
    request<WorkOrderPartReservationPublic>(
      `/api/v1/work-orders/${id}/part-reservations`,
      { method: "POST", body },
    ),

  deletePartReservation: (id: string, reservationId: string) =>
    request<{ message: string }>(
      `/api/v1/work-orders/${id}/part-reservations/${reservationId}`,
      { method: "DELETE" },
    ),

  addPartConsumption: (
    id: string,
    body: { spare_part_id: string; quantity: number },
  ) =>
    request<WorkOrderPartConsumptionPublic>(
      `/api/v1/work-orders/${id}/part-consumption`,
      { method: "POST", body },
    ),
}

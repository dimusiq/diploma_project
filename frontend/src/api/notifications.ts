/**
 * API центра уведомлений.
 */
import { request } from "@/lib/apiClient.ts"

export const NOTIFICATION_SEVERITIES = ["critical", "warning", "info"] as const
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number]

export const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  critical: "Критично",
  warning: "Важно",
  info: "Инфо",
}

export interface NotificationPublic {
  id: string
  user_id: string
  type: string
  severity: string
  title: string
  body: string | null
  source: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

export interface NotificationListResponse {
  data: NotificationPublic[]
  count: number
}

export const notificationsApi = {
  getUnreadCount: () =>
    request<{ count: number }>("/api/v1/notifications/unread-count"),

  list: (params?: {
    skip?: number
    limit?: number
    unread_only?: boolean
    severity?: string
    type?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.skip != null) q.set("skip", String(params.skip))
    if (params?.limit != null) q.set("limit", String(params.limit))
    if (params?.unread_only) q.set("unread_only", "true")
    if (params?.severity) q.set("severity", params.severity)
    if (params?.type) q.set("type", params.type)
    const query = q.toString()
    return request<NotificationListResponse>(
      `/api/v1/notifications${query ? `?${query}` : ""}`,
    )
  },

  markRead: (id: string) =>
    request<{ message: string }>(`/api/v1/notifications/${id}/read`, {
      method: "POST",
    }),

  markAllRead: () =>
    request<{ message: string; marked: number }>("/api/v1/notifications/read-all", {
      method: "POST",
    }),

  clearAll: () =>
    request<{ message: string; archived: number }>("/api/v1/notifications", {
      method: "DELETE",
    }),

  /** Вызвать проверку и создание недостающих уведомлений (например, по просроченному ТО). Вызывать при открытии панели. */
  ensure: () =>
    request<{ message: string }>("/api/v1/notifications/ensure", {
      method: "POST",
    }),
}

/**
 * API журнала аудита (критичные действия администраторов).
 */

import { request } from "@/lib/apiClient.ts"

export interface AuditLogPublic {
  id: string
  user_id: string | null
  user_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  details: string | null
  ip_address: string | null
  created_at: string
}

export interface AuditLogListResponse {
  data: AuditLogPublic[]
  count: number
}

export interface AuditLogParams {
  skip?: number
  limit?: number
  resource_type?: string
  user_id?: string
}

export const auditApi = {
  list: (params?: AuditLogParams) => {
    const search = new URLSearchParams()
    if (params?.skip != null) search.set("skip", String(params.skip))
    if (params?.limit != null) search.set("limit", String(params.limit))
    if (params?.resource_type) search.set("resource_type", params.resource_type)
    if (params?.user_id) search.set("user_id", params.user_id)
    const query = search.toString()
    return request<AuditLogListResponse>(
      `/api/v1/audit/${query ? `?${query}` : ""}`,
    )
  },
}

/** Человекочитаемые подписи для action */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.create": "Создание пользователя",
  "user.update": "Изменение пользователя",
  "user.delete": "Удаление пользователя",
  "category.create": "Создание категории",
  "category.update": "Изменение категории",
  "category.delete": "Удаление категории",
  "brand.create": "Создание бренда",
  "brand.update": "Изменение бренда",
  "brand.delete": "Удаление бренда",
  "zone.create": "Создание зоны",
  "zone.update": "Изменение зоны",
  "zone.delete": "Удаление зоны",
  "password_recovery.requested": "Запрос сброса пароля",
}

/** Человекочитаемые подписи для resource_type */
export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  user: "Пользователь",
  category: "Категория",
  brand: "Бренд",
  zone: "Зона",
}

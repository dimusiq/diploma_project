/**
 * API справочника зон склада (управление в админке).
 */

import { request } from "@/lib/apiClient.ts"

export interface ZonePublic {
  id: string
  warehouse_id: string
  name: string
  code?: string | null
  zone_kind: string
  extra?: Record<string, unknown> | null
}

export interface ZoneCreate {
  name: string
  warehouse_id?: string | null
  code?: string | null
  zone_kind?: string
}

export interface ZoneUpdate {
  name?: string
  warehouse_id?: string | null
  code?: string | null
  zone_kind?: string
  extra?: Record<string, unknown> | null
}

export const zonesApi = {
  list: () => request<ZonePublic[]>("/api/v1/zones/"),
  get: (id: string) => request<ZonePublic>(`/api/v1/zones/${id}`),
  create: (body: ZoneCreate) =>
    request<ZonePublic>("/api/v1/zones/", { method: "POST", body }),
  update: (id: string, body: ZoneUpdate) =>
    request<ZonePublic>(`/api/v1/zones/${id}`, { method: "PUT", body }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/zones/${id}`, { method: "DELETE" }),
}

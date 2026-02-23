/**
 * API справочника зон склада (управление в админке).
 */

import { request } from "@/lib/apiClient.ts"

export interface ZonePublic {
  id: string
  name: string
}

export interface ZoneCreate {
  name: string
}

export interface ZoneUpdate {
  name?: string
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

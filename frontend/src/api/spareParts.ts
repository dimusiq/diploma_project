/**
 * API склада запчастей (отдельная сущность, не вкладка «Склад»).
 */

import { request } from "@/lib/apiClient.ts"

export interface SparePartPublic {
  id: string
  title: string
  sku: string | null
  description: string | null
  quantity: number
  min_quantity: number | null
  unit: string | null
  created_at: string
  updated_at: string
}

export interface SparePartsListResponse {
  data: SparePartPublic[]
  count: number
}

export interface SparePartCreate {
  title: string
  sku?: string | null
  description?: string | null
  quantity?: number
  min_quantity?: number | null
  unit?: string | null
}

export interface SparePartUpdate {
  title?: string | null
  sku?: string | null
  description?: string | null
  quantity?: number | null
  min_quantity?: number | null
  unit?: string | null
}

export const sparePartsApi = {
  list: (params?: {
    skip?: number
    limit?: number
    search?: string
    below_min?: boolean
    sort_by?: string
    sort_order?: string
  }): Promise<SparePartsListResponse> => {
    const q = new URLSearchParams()
    if (params?.skip != null) q.set("skip", String(params.skip))
    if (params?.limit != null) q.set("limit", String(params.limit))
    if (params?.search) q.set("search", params.search)
    if (params?.below_min === true) q.set("below_min", "true")
    if (params?.sort_by) q.set("sort_by", params.sort_by)
    if (params?.sort_order) q.set("sort_order", params.sort_order)
    const query = q.toString()
    return request<SparePartsListResponse>(
      `/api/v1/spare-parts${query ? `?${query}` : ""}`,
    )
  },

  get: (id: string) =>
    request<SparePartPublic>(`/api/v1/spare-parts/${id}`),

  create: (body: SparePartCreate) =>
    request<SparePartPublic>("/api/v1/spare-parts/", {
      method: "POST",
      body,
    }),

  update: (id: string, body: SparePartUpdate) =>
    request<SparePartPublic>(`/api/v1/spare-parts/${id}`, {
      method: "PUT",
      body,
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/spare-parts/${id}`, {
      method: "DELETE",
    }),
}

/**
 * API справочника брендов техники (управление в админке).
 */

import { request } from "@/lib/apiClient.ts"

export interface BrandPublic {
  id: string
  name: string
}

export interface BrandCreate {
  name: string
}

export interface BrandUpdate {
  name?: string
}

export const brandsApi = {
  list: () => request<BrandPublic[]>("/api/v1/brands/"),
  get: (id: string) => request<BrandPublic>(`/api/v1/brands/${id}`),
  create: (body: BrandCreate) =>
    request<BrandPublic>("/api/v1/brands/", { method: "POST", body }),
  update: (id: string, body: BrandUpdate) =>
    request<BrandPublic>(`/api/v1/brands/${id}`, { method: "PUT", body }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/brands/${id}`, { method: "DELETE" }),
}

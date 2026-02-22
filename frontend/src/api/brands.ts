/**
 * API справочника брендов техники (управление в админке).
 */

import { OpenAPI } from "@/client/index.ts"

const getBase = () => OpenAPI.BASE || "http://localhost:8000"
const getToken = () => localStorage.getItem("access_token") || ""

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken()
  const url = `${getBase()}${path}`
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg =
      err.detail ||
      (Array.isArray(err.detail)
        ? err.detail.map((e: { msg: string }) => e.msg).join(", ")
        : res.statusText)
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

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

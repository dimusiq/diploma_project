/**
 * Единая точка входа для HTTP-запросов к API.
 * Использует те же BASE и токен, что и сгенерированный клиент (OpenAPI),
 * и выбрасывает ApiError при ошибках, чтобы глобальный обработчик 401/403 срабатывал.
 */

import { ApiError } from "@/client/core/ApiError"
import type { ApiRequestOptions } from "@/client/core/ApiRequestOptions"
import type { ApiResult } from "@/client/core/ApiResult"
import { OpenAPI } from "@/client/index.ts"
import { getAccessToken } from "@/lib/authStorage.ts"

const getBase = (): string => OpenAPI.BASE || "http://localhost:8000"

/** Базовый URL API (для кастомных fetch, где нужны заголовки ответа). */
export function getApiUrl(path: string): string {
  const base = getBase()
  return path.startsWith("http") ? path : `${base}${path}`
}

/** Заголовок Authorization с текущим токеном. */
export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken() ?? ""
  return { Authorization: `Bearer ${token}` }
}

export interface ApiClientRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  /** Для ответов PDF и т.п. */
  responseType?: "json" | "blob"
}

function buildRequestOptions(
  path: string,
  options: ApiClientRequestOptions,
): ApiRequestOptions {
  return {
    method: options.method ?? "GET",
    url: path,
    body: options.body,
  }
}

async function throwApiError(
  requestOptions: ApiRequestOptions,
  status: number,
  statusText: string,
  body: unknown,
  url: string,
): Promise<never> {
  const result: ApiResult = {
    url,
    status,
    statusText,
    body,
    ok: false,
  }
  const message =
    typeof body === "object" && body !== null && "detail" in body
      ? Array.isArray((body as { detail: unknown }).detail)
        ? (body as { detail: Array<{ msg?: string }> }).detail
            .map((e) => e.msg ?? "")
            .join(", ")
        : String((body as { detail: string }).detail)
      : statusText
  throw new ApiError(requestOptions, result, message)
}

/**
 * Выполняет запрос к API с единым токеном и базовым URL.
 * При 4xx/5xx выбрасывает ApiError (обрабатывается глобально: 401/403 → выход).
 */
export async function request<T>(
  path: string,
  options: ApiClientRequestOptions = {},
): Promise<T> {
  const base = getBase()
  const url = path.startsWith("http") ? path : `${base}${path}`
  const token = getAccessToken() ?? ""
  const method = options.method ?? "GET"
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  if (options.body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(url, {
    method,
    headers,
    ...(options.body !== undefined &&
      method !== "GET" && { body: JSON.stringify(options.body) }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    await throwApiError(
      buildRequestOptions(path, options),
      res.status,
      res.statusText,
      body,
      res.url,
    )
  }

  if (res.status === 204) return undefined as T
  if (options.responseType === "blob") return (await res.blob()) as T
  return res.json() as Promise<T>
}

/**
 * Выполняет fetch с единым токеном и базовым URL.
 * Возвращает Response (для чтения заголовков, blob и т.д.).
 * При !res.ok выбрасывает ApiError.
 */
export async function fetchWithAuth(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = getApiUrl(path)
  const headers = new Headers(init?.headers)
  if (!headers.has("Authorization")) {
    const token = getAccessToken() ?? ""
    headers.set("Authorization", `Bearer ${token}`)
  }
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    await throwApiError(
      { method: (init?.method as ApiRequestOptions["method"]) ?? "GET", url: path },
      res.status,
      res.statusText,
      body,
      res.url,
    )
  }
  return res
}

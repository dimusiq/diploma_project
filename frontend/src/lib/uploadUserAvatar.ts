import { ApiError } from "@/client/core/ApiError.ts"
import type { ApiRequestOptions } from "@/client/core/ApiRequestOptions.ts"
import type { ApiResult } from "@/client/core/ApiResult.ts"
import { OpenAPI } from "@/client/core/OpenAPI.ts"
import type { UserPublic } from "@/client/index.ts"
import { getAccessToken } from "@/lib/authStorage.ts"

const AVATAR_PATH = "/api/v1/users/me/avatar"

/**
 * Загрузка аватара через fetch + FormData (обходит нюансы axios с multipart и Vite proxy).
 */
export async function uploadUserAvatarFile(file: File): Promise<UserPublic> {
  const base = OpenAPI.BASE.replace(/\/$/, "")
  const url = `${base}${AVATAR_PATH}`
  const token = getAccessToken() ?? ""
  const fd = new FormData()
  fd.append("file", file)

  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })

  const request: ApiRequestOptions = { method: "POST", url: AVATAR_PATH }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    const result: ApiResult = {
      url,
      ok: false,
      status: res.status,
      statusText: res.statusText,
      body,
    }
    const detail = (body as { detail?: unknown }).detail
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail) && detail[0] && typeof detail[0] === "object" && "msg" in detail[0]
          ? String((detail[0] as { msg?: string }).msg)
          : res.statusText
    throw new ApiError(request, result, msg || "Ошибка загрузки аватара")
  }

  return res.json() as Promise<UserPublic>
}

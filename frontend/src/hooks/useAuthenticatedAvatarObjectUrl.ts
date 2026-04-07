import { useEffect, useRef, useState } from "react"

import { OpenAPI } from "@/client/core/OpenAPI.ts"
import { getAccessToken } from "@/lib/authStorage.ts"

/**
 * Blob URL для GET /api/v1/users/{id}/avatar с Bearer (для AvatarImage).
 * refreshKey — например dataUpdatedAt из useQuery currentUser, чтобы обновить картинку после загрузки.
 */
export function useAuthenticatedAvatarObjectUrl(
  userId: string | undefined,
  avatarExt: string | null | undefined,
  refreshKey: number | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!userId || !avatarExt) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setUrl(null)
      return
    }
    const token = getAccessToken()
    if (!token) {
      setUrl(null)
      return
    }
    const base = OpenAPI.BASE.replace(/\/$/, "")
    const ac = new AbortController()
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${base}/api/v1/users/${userId}/avatar`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        })
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = u
        setUrl(u)
      } catch {
        if (!cancelled) setUrl(null)
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [userId, avatarExt, refreshKey])

  return url
}

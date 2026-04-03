/**
 * SSE /api/v1/notifications/stream — инвалидация кэша уведомлений без опроса.
 * Переподключение после обрыва (в т.ч. истёкший токен → пауза до следующего цикла).
 */
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { getApiUrl } from "@/lib/apiClient.ts"
import { getAccessToken } from "@/lib/authStorage.ts"
import { safeInvalidateQueries } from "@/lib/safeInvalidate.ts"

const RECONNECT_MS = 5_000

function parseSseBlocks(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.split("\n\n")
  const rest = blocks.pop() ?? ""
  const events: string[] = []
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        events.push(line.slice(5).trim())
      }
    }
  }
  return { events, rest }
}

async function consumeNotificationStream(
  signal: AbortSignal,
  onData: (raw: string) => void,
): Promise<void> {
  const token = getAccessToken()
  if (!token) return

  const res = await fetch(getApiUrl("/api/v1/notifications/stream"), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok || !res.body) return

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const { events, rest } = parseSseBlocks(buf)
    buf = rest
    for (const raw of events) {
      onData(raw)
    }
  }
}

export function useNotificationSse() {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    const acRef = { current: null as AbortController | null }

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      clearTimer()
      if (!alive) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void loop()
      }, RECONNECT_MS)
    }

    const loop = async () => {
      if (!alive) return
      if (!getAccessToken()) {
        scheduleReconnect()
        return
      }
      acRef.current?.abort()
      acRef.current = new AbortController()
      const sig = acRef.current.signal
      try {
        await consumeNotificationStream(sig, (raw) => {
          try {
            const payload = JSON.parse(raw) as { type?: string }
            if (payload?.type === "notifications_updated") {
              safeInvalidateQueries(queryClient, { queryKey: ["notifications"] })
            }
          } catch {
            /* ignore malformed */
          }
        })
      } catch {
        /* abort / network */
      } finally {
        if (alive && !sig.aborted) {
          scheduleReconnect()
        }
      }
    }

    void loop()

    return () => {
      alive = false
      clearTimer()
      acRef.current?.abort()
    }
  }, [queryClient])
}

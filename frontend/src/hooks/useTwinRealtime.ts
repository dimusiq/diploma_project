/**
 * Единый SSE `/api/v1/twin/stream`: каналы + replay (в т.ч. `telemetry` — факты WMS/ERP/PLC).
 * Debounce инвалидаций React Query (~80ms) при пачках событий.
 * WebSocket: `WS /api/v1/twin/ws?token=…&channels=…&replay_seconds=…` — тот же контракт JSON.
 */
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { getApiUrl } from "@/lib/apiClient.ts"
import { getAccessToken } from "@/lib/authStorage.ts"
import { safeInvalidateQueries } from "@/lib/safeInvalidate.ts"
import {
  emitTwinStreamMessage,
  setTwinConnectionStatus,
} from "@/lib/twinRealtimeBus.ts"

const RECONNECT_MS = 5_000
const INVALIDATE_DEBOUNCE_MS = 80

export const TWIN_CHANNELS_ALL = [
  "occupancy",
  "item_movement",
  "task_updates",
  "equipment_positions",
  "alerts",
  "agent_runs",
  "telemetry",
] as const

export type TwinChannel = (typeof TWIN_CHANNELS_ALL)[number]

export type TwinStreamOptions = {
  channels?: readonly TwinChannel[]
  replaySeconds?: number
}

type TwinEnvelope = {
  v?: number
  channel?: string
  type?: string
  payload?: Record<string, unknown>
}

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

function twinStreamPath(options: TwinStreamOptions | undefined): string {
  const ch =
    options?.channels && options.channels.length > 0
      ? options.channels.join(",")
      : "*"
  const rs = options?.replaySeconds ?? 120
  const q = new URLSearchParams()
  q.set("channels", ch)
  q.set("replay_seconds", String(rs))
  return `/api/v1/twin/stream?${q.toString()}`
}

type InvalidateTag =
  | "items"
  | "warehouse"
  | "warehouse-twin-summary"
  | "equipment"
  | "notifications"
  | "tasks"

function tagsForMessage(
  msg: TwinEnvelope,
  currentUserId: string | undefined,
): InvalidateTag[] {
  const ch = msg.channel
  const uid = msg.payload?.user_id
  const out = new Set<InvalidateTag>()
  switch (ch) {
    case "occupancy":
      out.add("items")
      out.add("warehouse")
      out.add("warehouse-twin-summary")
      break
    case "item_movement":
      out.add("items")
      break
    case "task_updates":
      out.add("tasks")
      out.add("warehouse")
      break
    case "equipment_positions":
      out.add("equipment")
      break
    case "telemetry":
      out.add("warehouse")
      out.add("warehouse-twin-summary")
      out.add("equipment")
      break
    case "alerts":
      if (currentUserId == null || uid == null || uid === currentUserId) {
        out.add("notifications")
      }
      break
    case "agent_runs":
      if (currentUserId == null || uid == null || uid === currentUserId) {
        out.add("warehouse-twin-summary")
      }
      break
    default:
      break
  }
  return [...out]
}

function flushInvalidations(
  queryClient: ReturnType<typeof useQueryClient>,
  tags: Set<InvalidateTag>,
) {
  if (tags.has("items")) {
    safeInvalidateQueries(queryClient, { queryKey: ["items"] })
  }
  if (tags.has("warehouse")) {
    safeInvalidateQueries(queryClient, { queryKey: ["warehouse"] })
  }
  if (tags.has("warehouse-twin-summary")) {
    safeInvalidateQueries(queryClient, { queryKey: ["warehouse-twin-summary"] })
  }
  if (tags.has("equipment")) {
    safeInvalidateQueries(queryClient, { queryKey: ["equipment"] })
  }
  if (tags.has("notifications")) {
    safeInvalidateQueries(queryClient, { queryKey: ["notifications"] })
  }
  if (tags.has("tasks")) {
    safeInvalidateQueries(queryClient, { queryKey: ["tasks"] })
  }
}

async function readTwinSseBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onData: (raw: string) => void,
): Promise<void> {
  setTwinConnectionStatus("live")
  const reader = body.getReader()
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

export function useTwinRealtime(options?: TwinStreamOptions) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTagsRef = useRef<Set<InvalidateTag>>(new Set())

  useEffect(() => {
    let alive = true
    const acRef = { current: null as AbortController | null }
    const streamPath = twinStreamPath(options)

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const scheduleFlush = () => {
      clearTimer()
      if (!alive) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        const batch = pendingTagsRef.current
        pendingTagsRef.current = new Set()
        if (batch.size > 0) {
          flushInvalidations(queryClient, batch)
        }
      }, INVALIDATE_DEBOUNCE_MS)
    }

    const scheduleReconnect = () => {
      clearTimer()
      if (!alive) return
      setTimeout(() => {
        void loop()
      }, RECONNECT_MS)
    }

    const handleRaw = (raw: string) => {
      try {
        const msg = JSON.parse(raw) as TwinEnvelope & { type?: string }
        if (
          msg.type === "twin_replay_done" ||
          msg.type === "twin_ready" ||
          !msg.channel
        ) {
          return
        }
        emitTwinStreamMessage(msg)
        const me = queryClient.getQueryData<{ id?: string }>(["currentUser"])
        const uid = me?.id
        for (const t of tagsForMessage(msg, uid)) {
          pendingTagsRef.current.add(t)
        }
        scheduleFlush()
      } catch {
        /* ignore */
      }
    }

    const loop = async () => {
      if (!alive) return
      if (!getAccessToken()) {
        setTwinConnectionStatus("no_token")
        scheduleReconnect()
        return
      }
      setTwinConnectionStatus("connecting")
      acRef.current?.abort()
      acRef.current = new AbortController()
      const sig = acRef.current.signal
      try {
        const token = getAccessToken()
        if (!token) {
          setTwinConnectionStatus("no_token")
          return
        }
        const res = await fetch(getApiUrl(streamPath), {
          headers: { Authorization: `Bearer ${token}` },
          signal: sig,
        })
        if (!res.ok || !res.body) {
          setTwinConnectionStatus("offline")
          return
        }
        await readTwinSseBody(res.body, sig, handleRaw)
      } catch {
        if (!sig.aborted) {
          setTwinConnectionStatus("offline")
        }
      } finally {
        if (alive && !sig.aborted) {
          setTwinConnectionStatus("offline")
          scheduleReconnect()
        }
      }
    }

    void loop()

    return () => {
      alive = false
      clearTimer()
      setTwinConnectionStatus("offline")
      acRef.current?.abort()
    }
  }, [queryClient, options])
}

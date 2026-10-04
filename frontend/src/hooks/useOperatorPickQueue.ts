import { useCallback, useEffect, useRef, useState } from "react"
import {
  flushOperatorPickQueue,
  isBrowserOffline,
  pendingOperatorPickCount,
  readOperatorPickQueue,
  type FlushOperatorPickResult,
} from "@/lib/operatorPickQueue.ts"

/**
 * Подписка на размер офлайн-очереди и авто-flush при восстановлении сети.
 */
export function useOperatorPickQueue(
  onFlushed?: (r: FlushOperatorPickResult) => void,
) {
  const [pending, setPending] = useState(() => pendingOperatorPickCount())
  const [online, setOnline] = useState(() => !isBrowserOffline())
  const [syncing, setSyncing] = useState(false)
  const onFlushedRef = useRef(onFlushed)
  onFlushedRef.current = onFlushed

  const refresh = useCallback(() => {
    setPending(pendingOperatorPickCount())
  }, [])

  const flush = useCallback(async () => {
    if (isBrowserOffline()) {
      refresh()
      return null
    }
    if (readOperatorPickQueue().length === 0) {
      refresh()
      return null
    }
    setSyncing(true)
    try {
      const result = await flushOperatorPickQueue()
      refresh()
      onFlushedRef.current?.(result)
      return result
    } finally {
      setSyncing(false)
      refresh()
    }
  }, [refresh])

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      void flush()
    }
    const onOffline = () => {
      setOnline(false)
      refresh()
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    if (!isBrowserOffline()) {
      void flush()
    }
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [flush, refresh])

  return { pending, online, syncing, refresh, flush }
}

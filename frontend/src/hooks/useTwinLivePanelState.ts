import { useEffect, useState } from "react"

import {
  getTwinConnectionStatus,
  getTwinRecentMessages,
  subscribeTwinConnectionStatus,
  subscribeTwinStreamMessages,
  type TwinConnectionStatus,
  type TwinStreamEnvelope,
} from "@/lib/twinRealtimeBus.ts"

const VISIBLE = 16

/**
 * Состояние для панели «живой» twin: статус SSE и последние сообщения (из общей шины layout).
 */
export function useTwinLivePanelState() {
  const [status, setStatus] = useState<TwinConnectionStatus>(() =>
    getTwinConnectionStatus(),
  )
  const [messages, setMessages] = useState<TwinStreamEnvelope[]>(() => [
    ...getTwinRecentMessages(),
  ])

  useEffect(() => {
    return subscribeTwinConnectionStatus((s) => {
      setStatus(s)
    })
  }, [])

  useEffect(() => {
    setMessages([...getTwinRecentMessages()].slice(-VISIBLE))
    return subscribeTwinStreamMessages(() => {
      setMessages([...getTwinRecentMessages()].slice(-VISIBLE))
    })
  }, [])

  return { status, messages }
}

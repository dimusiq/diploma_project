/**
 * Состояние чата ассистента держим выше маршрута `/assistant`, чтобы при переключении
 * разделов (Outlet) не терялись сообщения и не обрывались запрос/streaming.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type AgentUserChatDetailPublic,
  type AgentUserChatPublic,
  createUserAssistantChat,
  deleteUserAssistantChat,
  fetchUserAssistantChat,
  fetchUserAssistantChats,
  postAgentChat,
} from "@/api/agent.ts"
import { ApiError } from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { getErrorHttpStatus } from "@/lib/apiClient.ts"
import type { ChatMessage } from "@/lib/assistantChatStorage.ts"
import { safeInvalidateQueries } from "@/lib/safeInvalidate.ts"

const STREAM_CHARS_PER_SEC_SMOOTH = 78
const STREAM_CHARS_PER_SEC_LONG = 260

export const CHAT_COLUMN_MAX = "52rem"
export const SIDEBAR_W = "272px"
export const NEBARDAK_LOGO_SRC = "/images/nebardak-logo.svg"

export const DS_MSG_IN = {
  animation: "dsMessageIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) both",
  "@keyframes dsMessageIn": {
    from: { opacity: 0, transform: "translateY(8px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
} as const

export const DS_THINKING = {
  animation: "dsThinking 1.25s ease-in-out infinite",
  "@keyframes dsThinking": {
    "0%, 100%": { opacity: 0.45 },
    "50%": { opacity: 0.95 },
  },
} as const

export const DS_CARET = {
  animation: "dsCaret 0.85s ease-in-out infinite",
  "@keyframes dsCaret": {
    "0%, 100%": { opacity: 0.2 },
    "50%": { opacity: 1 },
  },
} as const

export const DS_AVATAR = {
  animation: "dsAvatarIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both",
  "@keyframes dsAvatarIn": {
    from: { opacity: 0, transform: "scale(0.92)" },
    to: { opacity: 1, transform: "scale(1)" },
  },
} as const

export function bucketLabelForChat(updatedAt: string): string {
  const d = new Date(updatedAt)
  const t = new Date()
  const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const startT = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const dayDiff = Math.round(
    (startT.getTime() - startD.getTime()) / 86400000,
  )
  if (dayDiff === 0) return "Сегодня"
  if (dayDiff === 1) return "Вчера"
  if (dayDiff >= 2 && dayDiff < 7) return "На этой неделе"
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function mapApiMessages(rows: import("@/api/agent.ts").AgentUserChatMessagePublic[]): ChatMessage[] {
  return rows.map((m) => {
    if (m.role === "user") {
      return { id: m.id, role: "user", content: m.content }
    }
    const meta = (m.assistant_meta ?? {}) as Record<string, unknown>
    return {
      id: m.id,
      role: "assistant",
      content: m.content,
      llmAvailable: Boolean(meta.llm_available),
      model: (meta.model as string | null | undefined) ?? null,
      publicReasoning: meta.public_reasoning
        ? (meta.public_reasoning as import("@/api/agent.ts").AgentPublicReasoningSummary)
        : undefined,
      runId: (meta.run_id as string | null | undefined) ?? null,
    }
  })
}

export type AssistantSessionContextValue = {
  input: string
  setInput: (v: string) => void
  messages: ChatMessage[]
  activeChatId: string | null
  streamingMessageId: string | null
  deepStudy: boolean
  setDeepStudy: (v: boolean) => void
  historyDrawerOpen: boolean
  setHistoryDrawerOpen: (v: boolean) => void
  chatSearchQuery: string
  setChatSearchQuery: (v: string) => void
  sidebarHoveredChatId: string | null
  setSidebarHoveredChatId: (v: string | null) => void
  chatMenuOpenId: string | null
  setChatMenuOpenId: (v: string | null) => void
  isEnsuringChat: boolean
  scrollRef: React.RefObject<HTMLDivElement | null>
  composerRef: React.RefObject<HTMLTextAreaElement | null>
  chatsQuery: ReturnType<typeof useQuery<import("@/api/agent.ts").AgentUserChatListResponse>>
  detailQuery: ReturnType<typeof useQuery<AgentUserChatDetailPublic>>
  sortedChats: AgentUserChatPublic[]
  filteredChats: AgentUserChatPublic[]
  displayChats: AgentUserChatPublic[]
  groupedChats: { label: string; chats: AgentUserChatPublic[] }[]
  deleteChatMutation: ReturnType<
    typeof useMutation<void, unknown, string, unknown>
  >
  chatMutation: ReturnType<
    typeof useMutation<
      import("@/api/agent.ts").AgentChatResponse,
      unknown,
      { text: string; includePublicReasoning: boolean; userChatId: string },
      unknown
    >
  >
  send: () => Promise<void>
  newChat: () => void
  selectChat: (id: string) => void
  historyLocked: boolean
  composerDisabled: boolean
  bootLoading: boolean
  showErrorToast: (msg: string) => void
}

const AssistantSessionContext =
  createContext<AssistantSessionContextValue | null>(null)

export function AssistantSessionProvider({ children }: { children: ReactNode }) {
  const { showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  )
  const streamRafRef = useRef<number | null>(null)
  const streamingMessageIdRef = useRef<string | null>(null)
  const activeChatIdRef = useRef<string | null>(null)

  const [deepStudy, setDeepStudy] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState("")
  const [sidebarHoveredChatId, setSidebarHoveredChatId] = useState<
    string | null
  >(null)
  const [chatMenuOpenId, setChatMenuOpenId] = useState<string | null>(null)

  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isEnsuringChat, setIsEnsuringChat] = useState(false)

  const chatsQuery = useQuery({
    queryKey: ["agent-user-chats"],
    queryFn: fetchUserAssistantChats,
  })

  const detailQuery = useQuery({
    queryKey: ["agent-user-chat", activeChatId],
    queryFn: () => fetchUserAssistantChat(activeChatId!),
    enabled: !!activeChatId,
    retry: (count, err) =>
      getErrorHttpStatus(err) === 404 ? false : count < 1,
  })

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId
  }, [streamingMessageId])

  const deleteChatMutation = useMutation({
    mutationFn: deleteUserAssistantChat,
    onSuccess: async (_, deletedId) => {
      safeInvalidateQueries(queryClient, { queryKey: ["agent-user-chats"] })
      queryClient.removeQueries({ queryKey: ["agent-user-chat", deletedId] })
      if (activeChatIdRef.current === deletedId) {
        try {
          const list = await queryClient.fetchQuery({
            queryKey: ["agent-user-chats"],
            queryFn: fetchUserAssistantChats,
          })
          if (list.count === 0) {
            setActiveChatId(null)
            activeChatIdRef.current = null
          } else {
            setActiveChatId(list.data[0].id)
            activeChatIdRef.current = list.data[0].id
          }
        } catch {
          setActiveChatId(null)
          activeChatIdRef.current = null
          showErrorToast("Не удалось обновить список диалогов")
        }
      }
    },
  })

  useEffect(() => {
    if (!detailQuery.data || detailQuery.data.id !== activeChatId) return
    if (streamingMessageIdRef.current !== null) return
    setMessages(mapApiMessages(detailQuery.data.messages))
  }, [activeChatId, detailQuery.data])

  /** Сервер вернул 404 по выбранному чату (другая БД / удалён) — сбрасываем выбор. */
  useEffect(() => {
    if (!activeChatId) return
    const err = detailQuery.error
    if (!detailQuery.isFetched || !err) return
    if (getErrorHttpStatus(err) !== 404) return
    showErrorToast("Этот диалог на сервере не найден.")
    queryClient.removeQueries({ queryKey: ["agent-user-chat", activeChatId] })
    setActiveChatId(null)
    activeChatIdRef.current = null
    setMessages([])
    safeInvalidateQueries(queryClient, { queryKey: ["agent-user-chats"] })
  }, [
    activeChatId,
    detailQuery.isFetched,
    detailQuery.error,
    queryClient,
    showErrorToast,
  ])

  /** В списке с сервера нет выбранного id — убираем «призрачный» чат без лишних 404. */
  useEffect(() => {
    if (!activeChatId || !chatsQuery.isSuccess) return
    const rows = chatsQuery.data?.data ?? []
    if (rows.some((c) => c.id === activeChatId)) return
    queryClient.removeQueries({ queryKey: ["agent-user-chat", activeChatId] })
    setActiveChatId(null)
    activeChatIdRef.current = null
    setMessages([])
  }, [activeChatId, chatsQuery.isSuccess, chatsQuery.data, queryClient])

  const sortedChats = useMemo(() => {
    const rows = chatsQuery.data?.data ?? []
    return [...rows].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }, [chatsQuery.data])

  const filteredChats = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase()
    if (!q) return sortedChats
    return sortedChats.filter((c) => c.title.toLowerCase().includes(q))
  }, [sortedChats, chatSearchQuery])

  const displayChats = useMemo(() => {
    if (!activeChatId) return filteredChats
    const hasActive = filteredChats.some((c) => c.id === activeChatId)
    if (hasActive) return filteredChats
    const current = sortedChats.find((c) => c.id === activeChatId)
    if (!current) return filteredChats
    return [current, ...filteredChats]
  }, [filteredChats, sortedChats, activeChatId])

  const groupedChats = useMemo(() => {
    const out: { label: string; chats: AgentUserChatPublic[] }[] = []
    for (const c of displayChats) {
      const label = bucketLabelForChat(c.updated_at)
      const last = out[out.length - 1]
      if (last?.label === label) last.chats.push(c)
      else out.push({ label, chats: [c] })
    }
    return out
  }, [displayChats])

  const stopStreamRaf = useCallback(() => {
    if (streamRafRef.current !== null) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      stopStreamRaf()
    },
    [stopStreamRaf],
  )

  const chatMutation = useMutation({
    mutationFn: (vars: {
      text: string
      includePublicReasoning: boolean
      userChatId: string
    }) =>
      postAgentChat(vars.text, {
        userChatId: vars.userChatId,
        includePublicReasoning: vars.includePublicReasoning,
      }),
    onSuccess: (data, vars) => {
      const id = crypto.randomUUID()
      const full = data.reply
      stopStreamRaf()
      setStreamingMessageId(id)
      streamingMessageIdRef.current = id
      setActiveChatId(vars.userChatId)
      activeChatIdRef.current = vars.userChatId
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          content: "",
          llmAvailable: data.llm_available,
          model: data.model ?? null,
          publicReasoning: data.public_reasoning ?? undefined,
          runId: data.run_id ?? null,
        },
      ])

      const charsPerSec =
        full.length > 4000
          ? STREAM_CHARS_PER_SEC_LONG
          : STREAM_CHARS_PER_SEC_SMOOTH
      const t0 = performance.now()

      const runStreamFrame = (now: number) => {
        const elapsedSec = (now - t0) / 1000
        const pos = Math.min(Math.floor(elapsedSec * charsPerSec), full.length)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id && m.role === "assistant"
              ? { ...m, content: full.slice(0, pos) }
              : m,
          ),
        )
        if (pos >= full.length) {
          streamRafRef.current = null
          void (async () => {
            try {
              const cid = activeChatIdRef.current
              if (cid) {
                await queryClient.refetchQueries({
                  queryKey: ["agent-user-chat", cid],
                })
                const d = queryClient.getQueryData<AgentUserChatDetailPublic>([
                  "agent-user-chat",
                  cid,
                ])
                if (d) setMessages(mapApiMessages(d.messages))
                await queryClient.invalidateQueries({
                  queryKey: ["agent-user-chats"],
                })
              }
            } catch {
              /* refetch после ответа чата — не роняем UI необработанным rejection */
            } finally {
              streamingMessageIdRef.current = null
              setStreamingMessageId(null)
            }
          })()
          return
        }
        streamRafRef.current = requestAnimationFrame(runStreamFrame)
      }

      streamRafRef.current = requestAnimationFrame(runStreamFrame)
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : getErrorHttpStatus(err) != null && typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Не удалось получить ответ"
      showErrorToast(msg)
    },
  })

  const send = useCallback(async () => {
    const text = input.trim()
    if (
      !text ||
      chatMutation.isPending ||
      streamingMessageId !== null ||
      isEnsuringChat
    )
      return

    let chatId = activeChatIdRef.current
    if (!chatId) {
      setIsEnsuringChat(true)
      try {
        const c = await createUserAssistantChat()
        chatId = c.id
        activeChatIdRef.current = chatId
      } catch {
        showErrorToast("Не удалось начать диалог")
        return
      } finally {
        setIsEnsuringChat(false)
      }
    }

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ])
    setInput("")
    chatMutation.mutate({
      text,
      includePublicReasoning: deepStudy,
      userChatId: chatId,
    })
  }, [
    chatMutation,
    deepStudy,
    input,
    isEnsuringChat,
    showErrorToast,
    streamingMessageId,
  ])

  const historyLocked =
    chatMutation.isPending ||
    streamingMessageId !== null ||
    isEnsuringChat

  const newChat = useCallback(() => {
    if (historyLocked) return
    setActiveChatId(null)
    activeChatIdRef.current = null
    setMessages([])
    setInput("")
    safeInvalidateQueries(queryClient, { queryKey: ["agent-user-chats"] })
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      composerRef.current?.focus()
    })
  }, [historyLocked, queryClient])

  const selectChat = useCallback(
    (id: string) => {
      if (historyLocked || id === activeChatId) return
      setActiveChatId(id)
      setHistoryDrawerOpen(false)
    },
    [historyLocked, activeChatId],
  )

  const composerDisabled =
    chatMutation.isPending ||
    streamingMessageId !== null ||
    isEnsuringChat ||
    !input.trim()

  const bootLoading = chatsQuery.isPending

  const value = useMemo(
    (): AssistantSessionContextValue => ({
      input,
      setInput,
      messages,
      activeChatId,
      streamingMessageId,
      deepStudy,
      setDeepStudy,
      historyDrawerOpen,
      setHistoryDrawerOpen,
      chatSearchQuery,
      setChatSearchQuery,
      sidebarHoveredChatId,
      setSidebarHoveredChatId,
      chatMenuOpenId,
      setChatMenuOpenId,
      isEnsuringChat,
      scrollRef,
      composerRef,
      chatsQuery,
      detailQuery,
      sortedChats,
      filteredChats,
      displayChats,
      groupedChats,
      deleteChatMutation,
      chatMutation,
      send,
      newChat,
      selectChat,
      historyLocked,
      composerDisabled,
      bootLoading,
      showErrorToast,
    }),
    [
      input,
      messages,
      activeChatId,
      streamingMessageId,
      deepStudy,
      historyDrawerOpen,
      chatSearchQuery,
      sidebarHoveredChatId,
      chatMenuOpenId,
      isEnsuringChat,
      chatsQuery,
      detailQuery,
      sortedChats,
      filteredChats,
      displayChats,
      groupedChats,
      deleteChatMutation,
      chatMutation,
      send,
      newChat,
      selectChat,
      historyLocked,
      composerDisabled,
      bootLoading,
      showErrorToast,
    ],
  )

  return (
    <AssistantSessionContext.Provider value={value}>
      {children}
    </AssistantSessionContext.Provider>
  )
}

export function useAssistantSession(): AssistantSessionContextValue {
  const ctx = useContext(AssistantSessionContext)
  if (!ctx) {
    throw new Error(
      "useAssistantSession must be used within AssistantSessionProvider",
    )
  }
  return ctx
}

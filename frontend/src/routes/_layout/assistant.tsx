import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  type AgentPublicReasoningSummary,
  fetchAgentPermissions,
  fetchAgentRun,
  postAgentChat,
} from "@/api/agent.ts"
import { ApiError } from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"

export const Route = createFileRoute("/_layout/assistant")({
  beforeLoad: async ({ context }) => {
    const perm = await context.queryClient.fetchQuery({
      queryKey: ["agent-permissions"],
      queryFn: fetchAgentPermissions,
    })
    if (!perm.can_use) throw redirect({ to: "/" })
  },
  component: AssistantPage,
})

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string
      role: "assistant"
      content: string
      llmAvailable: boolean
      model: string | null
      publicReasoning?: AgentPublicReasoningSummary
      runId?: string | null
    }

function AgentRunTimeline({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ["agent-run", runId],
    queryFn: () => fetchAgentRun(runId),
    enabled: open,
  })
  return (
    <Box mt={2}>
      <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)}>
        {open ? "Скрыть таймлайн" : "Таймлайн запуска (шаги)"}
      </Button>
      {open ? (
        <Box mt={2}>
          {q.isPending ? (
            <Text fontSize="xs" color="fg.muted">
              Загрузка…
            </Text>
          ) : q.isError ? (
            <Text fontSize="xs" color="red.fg">
              Не удалось загрузить трассировку
            </Text>
          ) : (
            <Box
              as="pre"
              fontSize="10px"
              overflow="auto"
              maxH="200px"
              p={2}
              bg="bg.subtle"
              borderRadius="md"
            >
              {JSON.stringify(q.data?.steps ?? [], null, 2)}
            </Box>
          )}
        </Box>
      ) : null}
    </Box>
  )
}

function AssistantPage() {
  const { showErrorToast } = useCustomToast()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const chatMutation = useMutation({
    mutationFn: (text: string) => postAgentChat(text),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          llmAvailable: data.llm_available,
          model: data.model,
          publicReasoning: data.public_reasoning,
          runId: data.run_id ?? null,
        },
      ])
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.message : "Не удалось получить ответ"
      showErrorToast(msg)
    },
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, chatMutation.isPending])

  const send = () => {
    const text = input.trim()
    if (!text || chatMutation.isPending) return
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ])
    setInput("")
    chatMutation.mutate(text)
  }

  return (
    <Container maxW="4xl" py={{ base: 6, md: 10 }} px={{ base: 2, md: 4 }}>
      <Heading size="lg" mb={2} textAlign={{ base: "center", md: "left" }}>
        Ассистент склада
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={6}>
        Вопросы по остаткам, ячейкам и layout — с учётом ваших прав. Ответ
        формируется на сервере; при настроенном inference (vLLM / OpenAI-совместимый
        API) подключается языковая модель.
      </Text>

      <Box
        ref={scrollRef}
        borderWidth="1px"
        borderRadius="lg"
        bg="bg.subtle"
        minH="280px"
        maxH="min(55vh, 520px)"
        overflowY="auto"
        p={4}
        mb={4}
      >
        {messages.length === 0 && !chatMutation.isPending ? (
          <Text color="fg.muted" fontSize="sm">
            Например: «Сколько позиций на складе?», «Какие ряды в layout?»
          </Text>
        ) : (
          <Flex direction="column" gap={4}>
            {messages.map((m) =>
              m.role === "user" ? (
                <Box key={m.id} alignSelf="flex-end" maxW="85%">
                  <Box
                    bg="blue.subtle"
                    color="fg"
                    px={3}
                    py={2}
                    borderRadius="lg"
                    fontSize="sm"
                    whiteSpace="pre-wrap"
                  >
                    {m.content}
                  </Box>
                </Box>
              ) : (
                <Box key={m.id} alignSelf="flex-start" maxW="90%">
                  <Flex gap={2} align="center" flexWrap="wrap" mb={1}>
                    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
                      Ассистент
                    </Text>
                    <Badge
                      size="sm"
                      colorPalette={m.llmAvailable ? "green" : "gray"}
                    >
                      {m.llmAvailable
                        ? `LLM${m.model ? `: ${m.model}` : ""}`
                        : "без LLM"}
                    </Badge>
                  </Flex>
                  <Box
                    bg="bg"
                    borderWidth="1px"
                    px={3}
                    py={2}
                    borderRadius="lg"
                    fontSize="sm"
                    whiteSpace="pre-wrap"
                  >
                    {m.content}
                  </Box>
                  {m.publicReasoning ? (
                    <Box
                      mt={2}
                      pl={2}
                      borderLeftWidth="3px"
                      borderColor="border.muted"
                      fontSize="xs"
                      color="fg.muted"
                    >
                      <Text fontWeight="semibold" color="fg" mb={1}>
                        Как сформирован ответ
                      </Text>
                      <Text mb={1}>
                        <Text as="span" fontWeight="medium">
                          Кратко:{" "}
                        </Text>
                        {m.publicReasoning.brief_explanation}
                      </Text>
                      {m.publicReasoning.tools_used.length > 0 ? (
                        <Text mb={1}>
                          Инструменты:{" "}
                          {m.publicReasoning.tools_used
                            .map((t) => t.name || "?")
                            .join(", ")}
                        </Text>
                      ) : null}
                      <Text mb={1}>
                        Источники данных:{" "}
                        {m.publicReasoning.data_sources.join(", ")}
                      </Text>
                      <Text>
                        <Text as="span" fontWeight="medium">
                          Итог:{" "}
                        </Text>
                        {m.publicReasoning.recommendation}
                      </Text>
                      {m.publicReasoning.next_steps &&
                      m.publicReasoning.next_steps !== "—" ? (
                        <Text mt={1}>
                          <Text as="span" fontWeight="medium">
                            Следующие шаги:{" "}
                          </Text>
                          {m.publicReasoning.next_steps}
                        </Text>
                      ) : null}
                      {m.publicReasoning.confidence ? (
                        <Text mt={1}>
                          <Text as="span" fontWeight="medium">
                            Уверенность:{" "}
                          </Text>
                          {m.publicReasoning.confidence}
                        </Text>
                      ) : null}
                      {m.publicReasoning.kpi_effect ? (
                        <Text mt={1}>
                          <Text as="span" fontWeight="medium">
                            Эффект / KPI:{" "}
                          </Text>
                          {m.publicReasoning.kpi_effect}
                        </Text>
                      ) : null}
                      {m.publicReasoning.run_log_ref ? (
                        <Text mt={1} wordBreak="break-all">
                          <Text as="span" fontWeight="medium">
                            Лог запуска:{" "}
                          </Text>
                          {m.publicReasoning.run_log_ref}
                        </Text>
                      ) : null}
                      {m.publicReasoning.operational_cycle &&
                      Object.keys(m.publicReasoning.operational_cycle).length >
                        0 ? (
                        <Box mt={2} fontSize="10px" opacity={0.85}>
                          <Text fontWeight="medium" mb={0.5}>
                            Цикл агента
                          </Text>
                          {Object.entries(m.publicReasoning.operational_cycle).map(
                            ([k, v]) => (
                              <Text key={k}>
                                {k}: {v}
                              </Text>
                            ),
                          )}
                        </Box>
                      ) : null}
                    </Box>
                  ) : null}
                  {m.runId ? (
                    <Box mt={2} fontSize="xs" color="fg.muted">
                      <Text mb={1}>
                        Запуск: <code>{m.runId}</code>
                      </Text>
                      <AgentRunTimeline runId={m.runId} />
                    </Box>
                  ) : null}
                </Box>
              ),
            )}
            {chatMutation.isPending ? (
              <Text fontSize="sm" color="fg.muted">
                Ответ…
              </Text>
            ) : null}
          </Flex>
        )}
      </Box>

      <Flex gap={2} align="flex-end" direction={{ base: "column", sm: "row" }}>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ваш вопрос…"
          rows={3}
          size="sm"
          flex="1"
          minH="80px"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              send()
            }
          }}
        />
        <Button
          colorPalette="blue"
          loading={chatMutation.isPending}
          disabled={chatMutation.isPending || !input.trim()}
          onClick={send}
          minW={{ sm: "120px" }}
        >
          Отправить
        </Button>
      </Flex>
      <Text fontSize="xs" color="fg.muted" mt={2}>
        Ctrl+Enter — отправить
      </Text>
    </Container>
  )
}

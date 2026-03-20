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
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { fetchAgentPermissions, postAgentChat } from "@/api/agent.ts"
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
      ollamaAvailable: boolean
      model: string | null
    }

function AssistantPage() {
  const { showErrorToast } = useCustomToast()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const chatMutation = useMutation({
    mutationFn: postAgentChat,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          ollamaAvailable: data.ollama_available,
          model: data.model,
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
        формируется на сервере; при настроенной Ollama подключается локальная
        модель.
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
                      colorPalette={m.ollamaAvailable ? "green" : "gray"}
                    >
                      {m.ollamaAvailable
                        ? `Ollama${m.model ? `: ${m.model}` : ""}`
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

import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  IconButton,
  Image,
  Input,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router"
import { useEffect } from "react"
import {
  FiAnchor,
  FiCpu,
  FiEdit2,
  FiMenu,
  FiMoreHorizontal,
  FiPlus,
  FiSend,
  FiShare2,
  FiTrash2,
} from "react-icons/fi"
import { fetchAgentPermissions } from "@/api/agent.ts"
import { ApiError } from "@/client/index.ts"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer.tsx"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu.tsx"
import {
  CHAT_COLUMN_MAX,
  DS_AVATAR,
  DS_CARET,
  DS_MSG_IN,
  DS_THINKING,
  NEBARDAK_LOGO_SRC,
  SIDEBAR_W,
  useAssistantSession,
} from "@/contexts/AssistantSessionContext.tsx"
import { sanitizeAssistantChatContent } from "@/lib/agentReplySanitize.ts"

export const Route = createFileRoute("/_layout/assistant")({
  beforeLoad: async ({ context }) => {
    try {
      const perm = await context.queryClient.fetchQuery({
        queryKey: ["agent-permissions"],
        queryFn: fetchAgentPermissions,
      })
      if (!perm.can_use) throw redirect({ to: "/" })
    } catch (e) {
      if (isRedirect(e)) throw e
      if (e instanceof ApiError && [401, 403].includes(e.status)) {
        throw redirect({ to: "/login" })
      }
      throw e
    }
  },
  component: AssistantPage,
})

function AssistantPage() {
  const {
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
    sortedChats,
    filteredChats,
    groupedChats,
    deleteChatMutation,
    chatMutation,
    send,
    newChat,
    selectChat,
    historyLocked,
    composerDisabled,
    bootLoading,
  } = useAssistantSession()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, chatMutation.isPending, streamingMessageId, scrollRef])

  const historyList = (
    <Flex direction="column" h="full" minH={0} gap={3}>
      <Button
        w="full"
        size="sm"
        h="38px"
        variant="outline"
        justifyContent="center"
        gap={2}
        borderRadius="full"
        fontWeight="medium"
        borderWidth="0"
        bg="gray.700"
        color="gray.50"
        _hover={{ bg: "gray.600", color: "white" }}
        _active={{ bg: "gray.600" }}
        onClick={newChat}
        disabled={historyLocked}
      >
        <Flex
          align="center"
          justify="center"
          w="22px"
          h="22px"
          borderRadius="full"
          bg="whiteAlpha.200"
          flexShrink={0}
        >
          <FiPlus size={14} strokeWidth={2.5} />
        </Flex>
        Новый чат
      </Button>
      <Input
        w="full"
        size="sm"
        h="36px"
        bg="gray.800"
        borderWidth="1px"
        borderColor="whiteAlpha.200"
        color="gray.100"
        _placeholder={{ color: "gray.500" }}
        placeholder="Поиск по названию…"
        value={chatSearchQuery}
        onChange={(e) => setChatSearchQuery(e.target.value)}
        borderRadius="lg"
        _focus={{
          borderColor: "blue.400",
          boxShadow: "0 0 0 1px var(--chakra-colors-blue-400)",
        }}
      />
      <Box
        flex="1"
        minH={0}
        overflowY="auto"
        css={{
          scrollbarGutter: "stable",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.15) transparent",
          "&::-webkit-scrollbar": { width: "6px" },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(255,255,255,0.12)",
            borderRadius: "999px",
          },
          "&::-webkit-scrollbar-track": { background: "transparent" },
        }}
      >
        {filteredChats.length === 0 && sortedChats.length > 0 ? (
          <Text fontSize="xs" color="gray.500" py={2} px={1}>
            Ничего не найдено
          </Text>
        ) : null}
        {groupedChats.map((group, gi) => (
          <Box key={`${group.label}-${gi}`}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              color="gray.500"
              px={1.5}
              pt={gi === 0 ? 0 : 3}
              pb={1.5}
              userSelect="none"
            >
              {group.label}
            </Text>
            {group.chats.map((c) => {
              const active = c.id === activeChatId
              const showMenuBtn =
                active ||
                sidebarHoveredChatId === c.id ||
                chatMenuOpenId === c.id
              return (
                <Flex
                  key={c.id}
                  align="center"
                  gap={0}
                  mb={0.5}
                  borderRadius="md"
                  px={1}
                  py={0.5}
                  bg={active ? "gray.800" : "transparent"}
                  _hover={{ bg: "gray.800" }}
                  onMouseEnter={() => setSidebarHoveredChatId(c.id)}
                  onMouseLeave={() => setSidebarHoveredChatId(null)}
                  transition="background 0.12s ease"
                >
                  <Button
                    flex="1"
                    minW={0}
                    variant="ghost"
                    size="sm"
                    h="auto"
                    minH="36px"
                    py={1.5}
                    px={2}
                    fontWeight="normal"
                    justifyContent="flex-start"
                    borderRadius="md"
                    onClick={() => selectChat(c.id)}
                    disabled={historyLocked}
                    color="gray.100"
                    _hover={{ bg: "transparent" }}
                  >
                    <Text fontSize="sm" truncate textAlign="left" title={c.title}>
                      {c.title}
                    </Text>
                  </Button>
                  <MenuRoot
                    onOpenChange={(details) =>
                      setChatMenuOpenId(details.open ? c.id : null)
                    }
                  >
                    <MenuTrigger asChild>
                      <IconButton
                        aria-label="Действия с чатом"
                        size="xs"
                        variant="ghost"
                        flexShrink={0}
                        borderRadius="full"
                        color="gray.400"
                        _hover={{ bg: "whiteAlpha.200", color: "gray.100" }}
                        disabled={historyLocked}
                        opacity={{ base: 1, md: showMenuBtn ? 1 : 0 }}
                        transition="opacity 0.12s ease"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FiMoreHorizontal size={18} />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent
                      minW="11rem"
                      bg="gray.800"
                      color="gray.100"
                      borderWidth="1px"
                      borderColor="whiteAlpha.300"
                      boxShadow="lg"
                    >
                      <MenuItem
                        value="rename"
                        gap={2}
                        py={2}
                        disabled
                        opacity={0.45}
                        cursor="not-allowed"
                      >
                        <FiEdit2 size={16} />
                        Переименовать
                      </MenuItem>
                      <MenuItem
                        value="pin"
                        gap={2}
                        py={2}
                        disabled
                        opacity={0.45}
                        cursor="not-allowed"
                      >
                        <FiAnchor size={16} />
                        Закрепить
                      </MenuItem>
                      <MenuItem
                        value="share"
                        gap={2}
                        py={2}
                        disabled
                        opacity={0.45}
                        cursor="not-allowed"
                      >
                        <FiShare2 size={16} />
                        Поделиться
                      </MenuItem>
                      <MenuItem
                        value="delete"
                        gap={2}
                        py={2}
                        colorPalette="red"
                        onClick={() => deleteChatMutation.mutate(c.id)}
                      >
                        <FiTrash2 size={16} />
                        Удалить
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Flex>
              )
            })}
          </Box>
        ))}
      </Box>
    </Flex>
  )

  if (chatsQuery.isError) {
    return (
      <Container maxW="100%" px={{ base: 2, md: 4 }} py={{ base: 4, md: 6 }}>
        <Text color="red.fg" fontSize="sm">
          Не удалось загрузить историю чатов. Обновите страницу.
        </Text>
      </Container>
    )
  }

  if (bootLoading) {
    return (
      <Container maxW="100%" px={{ base: 2, md: 4 }} py={{ base: 4, md: 6 }}>
        <Flex
          align="center"
          justify="center"
          minH="200px"
          h={{ base: "calc(100dvh - 10.5rem)", md: "calc(100dvh - 9rem)" }}
        >
          <Text color="fg.muted" fontSize="sm">
            Загрузка чатов…
          </Text>
        </Flex>
      </Container>
    )
  }

  return (
    <Box w="full" maxW="100%" px={{ base: 0, md: 0 }} py={0}>
      <Flex
        direction="row"
        w="full"
        mx="auto"
        maxW="100%"
        h={{ base: "calc(100dvh - 10.5rem)", md: "calc(100dvh - 9rem)" }}
        minH="380px"
        maxH={{ base: "calc(100dvh - 8rem)", md: "calc(100dvh - 7rem)" }}
        align="stretch"
        gap={{ base: 0, md: 2 }}
      >
        <Box
          display={{ base: "none", md: "flex" }}
          flexDirection="column"
          flexShrink={0}
          w={SIDEBAR_W}
          minW={0}
          minH={0}
          p={3}
          bg="gray.900"
          color="gray.100"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="xl"
        >
          <Heading
            size="sm"
            fontWeight="semibold"
            letterSpacing="-0.03em"
            lineHeight="short"
            color="gray.50"
          >
            Nebardak
          </Heading>
          <Text fontSize="2xs" color="gray.500" mb={3} lineHeight="short">
            Ассистент склада
          </Text>
          {historyList}
        </Box>

        <Flex
          direction="column"
          flex="1"
          minW={0}
          minH={0}
          bg="bg.subtle"
          borderWidth={{ base: 0, md: "1px" }}
          borderColor="border.muted"
          borderRadius={{ base: "none", md: "xl" }}
          overflow="hidden"
        >
          <Flex
            flexShrink={0}
            align="center"
            gap={2}
            px={{ base: 3, md: 5 }}
            py={2.5}
            borderBottomWidth={
              messages.length === 0 &&
              !chatMutation.isPending &&
              !streamingMessageId &&
              !isEnsuringChat
                ? "0"
                : "1px"
            }
            borderColor="border.muted"
            bg="bg.subtle"
          >
            <IconButton
              display={{ base: "inline-flex", md: "none" }}
              aria-label="История чатов"
              variant="ghost"
              size="sm"
              flexShrink={0}
              borderRadius="lg"
              onClick={() => setHistoryDrawerOpen(true)}
            >
              <FiMenu />
            </IconButton>
            <Heading
              size="sm"
              fontWeight="semibold"
              letterSpacing="-0.02em"
              flex="1"
              truncate
            >
              {messages.length > 0 ? "Чат" : "Новый диалог"}
            </Heading>
          </Flex>

          <Box
            ref={scrollRef}
            flex="1"
            minH={0}
            w="full"
            overflowY="auto"
            bg="bg.subtle"
            display="flex"
            flexDirection="column"
            css={{
              scrollbarGutter: "stable",
              scrollBehavior: "smooth",
            }}
          >
            {messages.length === 0 &&
            !chatMutation.isPending &&
            !streamingMessageId &&
            !isEnsuringChat ? (
              <Flex
                flex="1"
                align="center"
                justify="center"
                flexDirection="column"
                px={4}
                py={{ base: 6, md: 10 }}
                minH={0}
                css={DS_MSG_IN}
              >
                <Box maxW={CHAT_COLUMN_MAX} w="full">
                  <Flex
                    align="center"
                    justify="center"
                    gap={{ base: 3, md: 4 }}
                    mb={5}
                    flexWrap="wrap"
                    rowGap={3}
                  >
                    <Image
                      src={NEBARDAK_LOGO_SRC}
                      alt="Nebardak"
                      h={{ base: "34px", md: "40px" }}
                      w="auto"
                      maxW="120px"
                      objectFit="contain"
                      flexShrink={0}
                      draggable={false}
                    />
                    <Heading
                      as="h1"
                      size="xl"
                      fontWeight="semibold"
                      letterSpacing="-0.04em"
                      color="fg"
                      lineHeight="shorter"
                      textAlign={{ base: "center", sm: "left" }}
                    >
                      Чем могу помочь?
                    </Heading>
                  </Flex>
                  <Text
                    color="fg.muted"
                    fontSize="sm"
                    lineHeight="tall"
                    mb={2}
                    textAlign="center"
                    maxW="32rem"
                    mx="auto"
                  >
                    {!activeChatId
                      ? sortedChats.length > 0
                        ? "Новый пустой диалог. Предыдущий чат в списке слева; напишите ниже, чтобы продолжить."
                        : "Задайте вопрос по складу — диалог появится в истории после первой отправки."
                      : "Например: «Сколько позиций на складе?», «Какие ряды в layout?»"}
                  </Text>
                  <Text
                    fontSize="xs"
                    color="fg.muted"
                    opacity={0.9}
                    textAlign="center"
                    maxW="32rem"
                    mx="auto"
                  >
                    Ответ на сервере с учётом прав и данных склада. Веб-поиск не
                    используется.
                  </Text>
                </Box>
              </Flex>
            ) : (
              <Flex direction="column" w="full">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <Box
                      key={m.id}
                      w="full"
                      py={{ base: 4, md: 5 }}
                      px={{ base: 4, md: 8 }}
                      bg="transparent"
                      css={DS_MSG_IN}
                    >
                      <Flex
                        maxW={CHAT_COLUMN_MAX}
                        mx="auto"
                        w="full"
                        justify="flex-end"
                      >
                        <Box
                          bg="bg"
                          color="fg"
                          px={4}
                          py={3}
                          borderRadius="2xl"
                          borderWidth="1px"
                          borderColor="border.muted"
                          maxW="min(85%, 36rem)"
                          fontSize="sm"
                          lineHeight="1.75"
                          whiteSpace="pre-wrap"
                          boxShadow="sm"
                          transition="box-shadow 0.2s ease, border-color 0.2s ease"
                        >
                          {m.content}
                        </Box>
                      </Flex>
                    </Box>
                  ) : (
                    <Box
                      key={m.id}
                      w="full"
                      py={{ base: 4, md: 5 }}
                      px={{ base: 4, md: 8 }}
                      bg="transparent"
                      css={DS_MSG_IN}
                    >
                      <Flex
                        maxW={CHAT_COLUMN_MAX}
                        mx="auto"
                        w="full"
                        gap={3}
                        align="flex-start"
                      >
                        <Flex
                          flexShrink={0}
                          w="28px"
                          h="28px"
                          borderRadius="md"
                          bg="blue.subtle"
                          color="fg"
                          align="center"
                          justify="center"
                          fontSize="10px"
                          fontWeight="bold"
                          mt={0.5}
                          css={DS_AVATAR}
                        >
                          AI
                        </Flex>
                        <Box flex="1" minW={0}>
                          <Flex
                            gap={2}
                            align="center"
                            flexWrap="wrap"
                            mb={2}
                            rowGap={1}
                          >
                            <Text
                              fontSize="xs"
                              fontWeight="semibold"
                              color="fg.muted"
                            >
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
                          {streamingMessageId === m.id ? (
                            <Text
                              fontSize="xs"
                              color="fg.muted"
                              mb={2}
                              letterSpacing="0.02em"
                              css={DS_THINKING}
                            >
                              Изучаем информацию
                            </Text>
                          ) : null}
                          <Text
                            fontSize="sm"
                            lineHeight="tall"
                            whiteSpace="pre-wrap"
                            color="fg"
                          >
                            {sanitizeAssistantChatContent(m.content)}
                            {streamingMessageId === m.id ? (
                              <Text
                                as="span"
                                display="inline-block"
                                color="fg.muted"
                                ml="0.5"
                                verticalAlign="text-bottom"
                                css={DS_CARET}
                              >
                                ▍
                              </Text>
                            ) : null}
                          </Text>
                          {m.publicReasoning && streamingMessageId !== m.id ? (
                            <Box
                              as="details"
                              mt={3}
                              fontSize="xs"
                              color="fg.muted"
                              css={{
                                "& summary": {
                                  cursor: "pointer",
                                  listStyle: "none",
                                },
                                "& summary::-webkit-details-marker": {
                                  display: "none",
                                },
                              }}
                            >
                              <Box
                                as="summary"
                                fontWeight="semibold"
                                color="fg"
                                userSelect="none"
                              >
                                Как сформирован ответ
                              </Box>
                              <Box
                                mt={2}
                                pl={2}
                                borderLeftWidth="3px"
                                borderColor="border.muted"
                              >
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
                                {m.publicReasoning.operational_cycle &&
                                Object.keys(m.publicReasoning.operational_cycle)
                                  .length > 0 ? (
                                  <Box mt={2} fontSize="10px" opacity={0.85}>
                                    <Text fontWeight="medium" mb={0.5}>
                                      Цикл агента
                                    </Text>
                                    {Object.entries(
                                      m.publicReasoning.operational_cycle,
                                    ).map(([k, v]) => (
                                      <Text key={k}>
                                        {k}: {v}
                                      </Text>
                                    ))}
                                  </Box>
                                ) : null}
                              </Box>
                            </Box>
                          ) : null}
                        </Box>
                      </Flex>
                    </Box>
                  ),
                )}
                {chatMutation.isPending ? (
                  <Box
                    w="full"
                    py={{ base: 4, md: 5 }}
                    px={{ base: 4, md: 8 }}
                    bg="transparent"
                    css={DS_MSG_IN}
                  >
                    <Flex
                      maxW={CHAT_COLUMN_MAX}
                      mx="auto"
                      w="full"
                      gap={3}
                      align="center"
                    >
                      <Flex
                        flexShrink={0}
                        w="28px"
                        h="28px"
                        borderRadius="md"
                        bg="blue.subtle"
                        color="fg"
                        align="center"
                        justify="center"
                        fontSize="10px"
                        fontWeight="bold"
                        css={DS_AVATAR}
                      >
                        AI
                      </Flex>
                      <Text
                        fontSize="sm"
                        color="fg.muted"
                        letterSpacing="0.02em"
                        css={DS_THINKING}
                      >
                        Изучаем информацию
                      </Text>
                    </Flex>
                  </Box>
                ) : null}
              </Flex>
            )}
          </Box>

          <Box
            flexShrink={0}
            px={{ base: 3, md: 5 }}
            pb={4}
            pt={3}
            borderTopWidth="1px"
            borderColor="border.muted"
            bg="bg.subtle"
          >
            <Box maxW={CHAT_COLUMN_MAX} mx="auto" w="full">
              <Box
                borderWidth="1px"
                borderColor="border.muted"
                borderRadius="2xl"
                overflow="hidden"
                bg="bg"
                boxShadow="sm"
              >
                <Box position="relative" pb={{ base: 10, md: 9 }}>
                  <Textarea
                    ref={composerRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      messages.length === 0
                        ? "Сообщение Nebardak…"
                        : "Сообщение для ассистента склада…"
                    }
                    autoresize
                    minH="64px"
                    maxH="220px"
                    w="full"
                    resize="none"
                    rows={2}
                    fontSize="sm"
                    lineHeight="tall"
                    py={4}
                    pl={4}
                    pr={4}
                    pb={{ base: 14, md: 12 }}
                    border="none"
                    borderRadius="none"
                    bg="transparent"
                    _focus={{ outline: "none", boxShadow: "none" }}
                    _focusVisible={{ outline: "none", boxShadow: "none" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                  />
                  <Flex
                    position="absolute"
                    left={3}
                    right={3}
                    bottom={3}
                    align="center"
                    justify="space-between"
                    gap={2}
                    pointerEvents="none"
                  >
                    <Flex
                      align="center"
                      gap={1.5}
                      flexWrap="wrap"
                      pointerEvents="auto"
                    >
                      <Button
                        type="button"
                        size="xs"
                        h="28px"
                        px={2.5}
                        borderRadius="full"
                        variant={!deepStudy ? "solid" : "outline"}
                        colorPalette={!deepStudy ? "blue" : "gray"}
                        fontWeight="medium"
                        gap={1}
                        disabled={historyLocked}
                        onClick={() => setDeepStudy(false)}
                        title="Обычный ответ без расширенной сводки"
                      >
                        Стандарт
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        h="28px"
                        px={2.5}
                        borderRadius="full"
                        variant={deepStudy ? "solid" : "outline"}
                        colorPalette={deepStudy ? "blue" : "gray"}
                        fontWeight="medium"
                        gap={1}
                        disabled={historyLocked}
                        onClick={() => setDeepStudy(true)}
                        title="Публичная сводка reasoning («как сформирован ответ»)"
                      >
                        <FiCpu size={14} />
                        Глубокое изучение
                      </Button>
                    </Flex>
                    <IconButton
                      aria-label="Отправить"
                      size="sm"
                      borderRadius="full"
                      colorPalette="blue"
                      flexShrink={0}
                      pointerEvents="auto"
                      disabled={composerDisabled}
                      loading={chatMutation.isPending || isEnsuringChat}
                      onClick={send}
                    >
                      <FiSend />
                    </IconButton>
                  </Flex>
                </Box>
                <Flex
                  borderTopWidth="1px"
                  borderColor="border.muted"
                  px={3}
                  py={2}
                  align="center"
                  justify="flex-end"
                  bg="bg.subtle"
                >
                  <Text fontSize="2xs" color="fg.muted">
                    Enter — отправить · Shift+Enter — новая строка 
                  </Text>
                </Flex>
              </Box>
            </Box>
          </Box>
        </Flex>
      </Flex>
      <DrawerRoot
        placement="start"
        open={historyDrawerOpen}
        onOpenChange={(e) => setHistoryDrawerOpen(e.open)}
        size="xs"
      >
        <DrawerBackdrop />
        <DrawerContent bg="gray.900" color="gray.100" borderColor="whiteAlpha.200">
          <DrawerCloseTrigger />
          <DrawerHeader borderBottomWidth="0" pb={0}>
            <DrawerTitle fontWeight="semibold" letterSpacing="-0.02em" color="gray.50">
              Nebardak
            </DrawerTitle>
            <Text fontSize="2xs" color="gray.500" fontWeight="normal" mt={0.5}>
              История чатов
            </Text>
          </DrawerHeader>
          <DrawerBody pb={6} pt={2} overflowY="auto">
            {historyList}
          </DrawerBody>
        </DrawerContent>
      </DrawerRoot>
    </Box>
  )
}

import { Box, Table, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { request } from "@/lib/apiClient.ts"

interface LogRow {
  id: string
  user_id: string
  created_at: string
  message_preview: string
  reply_preview: string
  llm_available: boolean
  model: string | null
}

interface LogList {
  data: LogRow[]
  count: number
}

export function AgentChatLogsAdmin() {
  const { data, isPending } = useQuery({
    queryKey: ["agent-chat-logs"],
    queryFn: () => request<LogList>("/api/v1/agent/chat/logs?limit=100"),
  })

  return (
    <Box pt={4}>
      <Text fontSize="sm" color="fg.muted" mb={4}>
        Последние обращения к ассистенту (все пользователи). Полные тексты не
        хранятся — только превью до 500 символов.
      </Text>
      {isPending ? (
        <Text fontSize="sm">Загрузка…</Text>
      ) : (
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Время</Table.ColumnHeader>
              <Table.ColumnHeader>User id</Table.ColumnHeader>
              <Table.ColumnHeader>Вопрос</Table.ColumnHeader>
              <Table.ColumnHeader>Ответ</Table.ColumnHeader>
              <Table.ColumnHeader>LLM</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data?.data.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell whiteSpace="nowrap" fontSize="xs">
                  {new Date(row.created_at).toLocaleString("ru-RU")}
                </Table.Cell>
                <Table.Cell fontSize="xs" maxW="100px">
                  <Text truncate title={row.user_id}>
                    {row.user_id.slice(0, 8)}…
                  </Text>
                </Table.Cell>
                <Table.Cell maxW="240px" fontSize="xs">
                  <Text truncate title={row.message_preview}>
                    {row.message_preview}
                  </Text>
                </Table.Cell>
                <Table.Cell maxW="240px" fontSize="xs">
                  <Text truncate title={row.reply_preview}>
                    {row.reply_preview}
                  </Text>
                </Table.Cell>
                <Table.Cell fontSize="xs">
                  {row.llm_available ? row.model ?? "да" : "нет"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  )
}

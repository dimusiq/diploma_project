import { useQuery } from "@tanstack/react-query"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
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
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Последние обращения к ассистенту (все пользователи). Полные тексты не
        хранятся — только превью до 500 символов.
      </p>
      {isPending ? (
        <p className="text-sm">Загрузка…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>User id</TableHead>
              <TableHead>Вопрос</TableHead>
              <TableHead>Ответ</TableHead>
              <TableHead>LLM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(row.created_at).toLocaleString("ru-RU")}
                </TableCell>
                <TableCell className="max-w-[100px] text-xs">
                  <span className="truncate" title={row.user_id}>
                    {row.user_id.slice(0, 8)}…
                  </span>
                </TableCell>
                <TableCell className="max-w-[240px] text-xs">
                  <span className="truncate" title={row.message_preview}>
                    {row.message_preview}
                  </span>
                </TableCell>
                <TableCell className="max-w-[240px] text-xs">
                  <span className="truncate" title={row.reply_preview}>
                    {row.reply_preview}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {row.llm_available ? row.model ?? "да" : "нет"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

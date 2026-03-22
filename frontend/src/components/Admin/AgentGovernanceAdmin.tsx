import {
  Box,
  Button,
  Heading,
  Table,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  fetchAgentPolicies,
  fetchAgentRuns,
  fetchAgentRun,
  updateAgentPolicy,
  type AgentPolicyPublic,
} from "@/api/agent.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"

function formatDt(s: string): string {
  return new Date(s).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function PolicyEditor({ row }: { row: AgentPolicyPublic }) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [text, setText] = useState(() =>
    JSON.stringify(row.rules ?? {}, null, 2),
  )
  const mut = useMutation({
    mutationFn: () => {
      const rules = JSON.parse(text) as Record<string, unknown>
      return updateAgentPolicy(row.code, { rules })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agent-policies"] })
      showSuccessToast("Политика сохранена")
    },
    onError: (e: Error) => showErrorToast(e.message),
  })
  return (
    <Box mb={8} borderWidth="1px" borderRadius="md" p={4}>
      <Heading size="sm" mb={1}>
        {row.title}
      </Heading>
      <Text fontSize="xs" color="fg.muted" mb={2}>
        code: {row.code} · обновлено {formatDt(row.updated_at)}
      </Text>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        fontFamily="mono"
        fontSize="xs"
        rows={12}
        mb={2}
      />
      <Button
        size="sm"
        loading={mut.isPending}
        onClick={() => {
          try {
            JSON.parse(text)
            mut.mutate()
          } catch {
            showErrorToast("Некорректный JSON")
          }
        }}
      >
        Сохранить rules (JSON)
      </Button>
    </Box>
  )
}

export function AgentGovernanceAdmin() {
  const polQ = useQuery({
    queryKey: ["agent-policies"],
    queryFn: fetchAgentPolicies,
  })
  const runsQ = useQuery({
    queryKey: ["agent-runs-admin", 0],
    queryFn: () => fetchAgentRuns(0, 40),
  })

  return (
    <Box pt={4}>
      <Heading size="md" mb={4}>
        Политики и безопасность агента
      </Heading>
      <Text fontSize="sm" color="fg.muted" mb={4}>
        Запись в БД <code>agent_policy</code> (например deny_tools, allow_act_tools).
        Изменения влияют на вызов инструментов на сервере.
      </Text>
      {polQ.isPending ? (
        <Text fontSize="sm">Загрузка политик…</Text>
      ) : polQ.isError ? (
        <Text color="red.fg" fontSize="sm">
          Нет доступа или ошибка загрузки политик (нужно право agent.policies.read).
        </Text>
      ) : (
        polQ.data?.data.map((p) => <PolicyEditor key={p.id} row={p} />)
      )}

      <Heading size="md" mt={10} mb={4}>
        Запуски агента (трассы)
      </Heading>
      <Text fontSize="sm" color="fg.muted" mb={4}>
        Сохранённые шаги observe / reason / act / verify / conclude. Детали — по
        клику (GET /agent/runs/&#123;id&#125;).
      </Text>
      {runsQ.isPending ? (
        <Text fontSize="sm">Загрузка…</Text>
      ) : runsQ.isError ? (
        <Text color="red.fg" fontSize="sm">
          Не удалось загрузить запуски.
        </Text>
      ) : (
        <AgentRunsTable runs={runsQ.data?.data ?? []} />
      )}
    </Box>
  )
}

function AgentRunsTable({
  runs,
}: {
  runs: Array<{
    id: string
    created_at: string
    model: string | null
    steps: unknown[]
  }>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ["agent-run", selectedId],
    queryFn: () => fetchAgentRun(selectedId!),
    enabled: selectedId != null,
  })
  return (
    <Box>
      <Table.Root size="sm" variant="line">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="14"> </Table.ColumnHeader>
            <Table.ColumnHeader>Время</Table.ColumnHeader>
            <Table.ColumnHeader>Модель</Table.ColumnHeader>
            <Table.ColumnHeader>Шагов</Table.ColumnHeader>
            <Table.ColumnHeader>ID</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {runs.map((r) => (
            <Table.Row key={r.id}>
              <Table.Cell>
                <Button
                  size="xs"
                  variant={selectedId === r.id ? "solid" : "ghost"}
                  onClick={() =>
                    setSelectedId((cur) => (cur === r.id ? null : r.id))
                  }
                >
                  {selectedId === r.id ? "Скрыть" : "Шаги"}
                </Button>
              </Table.Cell>
              <Table.Cell>{formatDt(r.created_at)}</Table.Cell>
              <Table.Cell>{r.model ?? "—"}</Table.Cell>
              <Table.Cell>
                {Array.isArray(r.steps) ? r.steps.length : 0}
              </Table.Cell>
              <Table.Cell fontFamily="mono" fontSize="xs">
                {r.id.slice(0, 8)}…
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {selectedId != null && (
        <Box mt={4}>
          {q.isPending ? (
            <Text fontSize="sm">Загрузка трассы…</Text>
          ) : q.isError ? (
            <Text fontSize="sm" color="red.fg">
              Не удалось загрузить запуск.
            </Text>
          ) : (
            <Box
              as="pre"
              fontSize="10px"
              overflow="auto"
              maxH="320px"
              p={3}
              bg="bg.subtle"
              borderRadius="md"
            >
              {JSON.stringify(q.data?.steps ?? [], null, 2)}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

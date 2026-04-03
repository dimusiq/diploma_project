import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  type AgentPolicyPublic,
  fetchAgentPolicies,
  fetchAgentRun,
  fetchAgentRuns,
  updateAgentPolicy,
} from "@/api/agent.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
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
    <div className="mb-8 rounded-md border border-border p-4">
      <h3 className="font-heading mb-1 text-sm font-semibold">
        {row.title}
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">
        code: {row.code} · обновлено {formatDt(row.updated_at)}
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mb-2 font-mono text-xs"
        rows={12}
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
    </div>
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
    <div>
      <h2 className="font-heading mb-4 text-lg font-semibold">
        Политики и безопасность агента
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Запись в БД <code>agent_policy</code> (например deny_tools, allow_act_tools).
        Изменения влияют на вызов инструментов на сервере.
      </p>
      {polQ.isPending ? (
        <p className="text-sm">Загрузка политик…</p>
      ) : polQ.isError ? (
        <p className="text-sm text-destructive">
          Нет доступа или ошибка загрузки политик (нужно право agent.policies.read).
        </p>
      ) : (
        polQ.data?.data.map((p) => <PolicyEditor key={p.id} row={p} />)
      )}

      <h2 className="font-heading mt-10 mb-4 text-lg font-semibold">
        Запуски агента (трассы)
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Сохранённые шаги observe / reason / act / verify / conclude. Детали — по
        клику (GET /agent/runs/&#123;id&#125;).
      </p>
      {runsQ.isPending ? (
        <p className="text-sm">Загрузка…</p>
      ) : runsQ.isError ? (
        <p className="text-sm text-destructive">
          Не удалось загрузить запуски.
        </p>
      ) : (
        <AgentRunsTable runs={runsQ.data?.data ?? []} />
      )}
    </div>
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
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14"> </TableHead>
            <TableHead>Время</TableHead>
            <TableHead>Модель</TableHead>
            <TableHead>Шагов</TableHead>
            <TableHead>ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Button
                  size="xs"
                  variant={selectedId === r.id ? "default" : "ghost"}
                  onClick={() =>
                    setSelectedId((cur) => (cur === r.id ? null : r.id))
                  }
                >
                  {selectedId === r.id ? "Скрыть" : "Шаги"}
                </Button>
              </TableCell>
              <TableCell>{formatDt(r.created_at)}</TableCell>
              <TableCell>{r.model ?? "—"}</TableCell>
              <TableCell>
                {Array.isArray(r.steps) ? r.steps.length : 0}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.id.slice(0, 8)}…
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedId != null && (
        <div className="mt-4">
          {q.isPending ? (
            <p className="text-sm">Загрузка трассы…</p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">
              Не удалось загрузить запуск.
            </p>
          ) : (
            <pre className="max-h-[320px] overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[10px]">
              {JSON.stringify(q.data?.steps ?? [], null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

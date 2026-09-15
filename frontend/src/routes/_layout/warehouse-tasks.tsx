import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { FiColumns, FiList } from "react-icons/fi"
import {
  fetchWarehouseTasks,
  patchWarehouseTask,
  type WarehouseTask,
} from "@/api/warehouseTasks.ts"
import { ApiError } from "@/client/index.ts"
import { PullToRefresh } from "@/components/Common/PullToRefresh.tsx"
import { WarehouseHubNav } from "@/components/Common/WarehouseHubNav.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { cn } from "@/lib/utils.ts"
import {
  parseWarehouseTaskTarget,
  taskTargetToSearch,
} from "@/lib/warehouseTaskTarget.ts"

export const Route = createFileRoute("/_layout/warehouse-tasks")({
  component: WarehouseTasksPage,
})

function Task3dLink({ task }: { task: WarehouseTask }) {
  const target = parseWarehouseTaskTarget(task.payload)
  const search = taskTargetToSearch(task.id, target)
  return (
    <Button asChild size="xs" variant="outline">
      <RouterLink to="/warehouse-3d" search={search}>
        В 3D
      </RouterLink>
    </Button>
  )
}

const STATUS_OPTIONS = [
  { value: SELECT_ALL_VALUE, label: "Все статусы" },
  { value: "pending", label: "pending" },
  { value: "in_progress", label: "in_progress" },
  { value: "blocked", label: "blocked" },
  { value: "completed", label: "completed" },
  { value: "cancelled", label: "cancelled" },
] as const

function WarehouseTasksPage() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("")
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table")

  const handleRefresh = useCallback(
    async () => {
      await qc.invalidateQueries({ queryKey: ["warehouse-tasks"] })
    },
    [qc],
  )

  const listQ = useQuery({
    queryKey: ["warehouse-tasks", statusFilter],
    queryFn: () =>
      fetchWarehouseTasks({
        status: statusFilter || undefined,
        limit: 100,
      }),
  })

  const patchMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      patchWarehouseTask(id, { status }),
    onSuccess: () => {
      showSuccessToast("Задание обновлено")
      void qc.invalidateQueries({ queryKey: ["warehouse-tasks"] })
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.message : "Ошибка сохранения"
      showErrorToast(msg)
    },
  })

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto w-full max-w-6xl px-2 py-6 md:px-4 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">
        Складские задания
      </h1>
      <WarehouseHubNav />
      <p className="mb-6 text-sm text-muted-foreground">
        Назначение и смена статуса (нужны права warehouse.tasks.*).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={toSelectAll(statusFilter)}
          onValueChange={(v) => setStatusFilter(fromSelectAll(v))}
        >
          <SelectTrigger className="h-9 w-full min-w-[220px] text-sm sm:w-auto">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={viewMode === "table" ? "default" : "outline"}
            onClick={() => setViewMode("table")}
          >
            <FiList className="mr-1 size-4" /> Таблица
          </Button>
          <Button
            size="sm"
            variant={viewMode === "kanban" ? "default" : "outline"}
            onClick={() => setViewMode("kanban")}
          >
            <FiColumns className="mr-1 size-4" /> Канбан
          </Button>
        </div>
      </div>

      {listQ.isPending ? (
        <Skeleton className="h-[240px]" />
      ) : listQ.isError ? (
        <p className="text-destructive">
          {listQ.error instanceof ApiError
            ? listQ.error.message
            : "Не удалось загрузить задания"}
        </p>
      ) : viewMode === "table" ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Обновлено</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(listQ.data?.data ?? []).map((t: WarehouseTask) => (
                <TableRow key={t.id}>
                  <TableCell>{t.task_type}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-md border border-border px-2 py-0.5 text-xs font-medium",
                      )}
                    >
                      {t.status}
                    </span>
                  </TableCell>
                  <TableCell>{t.priority}</TableCell>
                  <TableCell className="text-xs">
                    {new Date(t.updated_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        loading={patchMut.isPending}
                        disabled={t.status === "in_progress"}
                        onClick={() =>
                          patchMut.mutate({ id: t.id, status: "in_progress" })
                        }
                      >
                        В работу
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400"
                        loading={patchMut.isPending}
                        disabled={t.status === "completed"}
                        onClick={() =>
                          patchMut.mutate({ id: t.id, status: "completed" })
                        }
                      >
                        Готово
                      </Button>
                      <Task3dLink task={t} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {listQ.data?.data.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Нет заданий для выбранного фильтра.
            </p>
          ) : null}
        </div>
      ) : (
        <KanbanBoard
          tasks={listQ.data?.data ?? []}
          onStatusChange={(id, status) => patchMut.mutate({ id, status })}
          isPending={patchMut.isPending}
        />
      )}
      </div>
    </PullToRefresh>
  )
}

const KANBAN_COLUMNS = [
  { id: "pending", title: "Ожидают", statuses: ["pending"] },
  { id: "in_progress", title: "В работе", statuses: ["in_progress"] },
  { id: "blocked", title: "Заблокированы", statuses: ["blocked"] },
  { id: "done", title: "Выполнены", statuses: ["completed"] },
  { id: "cancelled", title: "Отменены", statuses: ["cancelled"] },
] as const

function priorityLabel(p: number) {
  if (p >= 8) return { text: "критичный", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
  if (p >= 5) return { text: "высокий", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" }
  if (p >= 3) return { text: "средний", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" }
  return { text: "низкий", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" }
}

function KanbanBoard({
  tasks,
  onStatusChange,
  isPending,
}: {
  tasks: WarehouseTask[]
  onStatusChange: (id: string, status: string) => void
  isPending: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) =>
          (col.statuses as readonly string[]).includes(t.status),
        )
        return (
          <div
            key={col.id}
            className="rounded-lg border border-border bg-muted/30 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {colTasks.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {colTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Нет задач
                </p>
              ) : (
                colTasks.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    onStatusChange={onStatusChange}
                    isPending={isPending}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanCard({
  task,
  onStatusChange,
  isPending,
}: {
  task: WarehouseTask
  onStatusChange: (id: string, status: string) => void
  isPending: boolean
}) {
  const prio = priorityLabel(task.priority)
  return (
    <div className="rounded-md border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", prio.cls)}>
          {prio.text}
        </span>
        <span className="text-xs text-muted-foreground">{task.task_type}</span>
      </div>
      <p className="text-sm font-medium">Задание #{task.id.slice(0, 8)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {new Date(task.updated_at).toLocaleString("ru-RU")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {task.status !== "in_progress" && task.status !== "completed" && (
          <Button
            size="xs"
            variant="outline"
            loading={isPending}
            onClick={() => onStatusChange(task.id, "in_progress")}
          >
            В работу
          </Button>
        )}
        {task.status !== "completed" && (
          <Button
            size="xs"
            variant="outline"
            className="border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400"
            loading={isPending}
            onClick={() => onStatusChange(task.id, "completed")}
          >
            Готово
          </Button>
        )}
        <Task3dLink task={task} />
      </div>
    </div>
  )
}

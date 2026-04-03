import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  fetchWarehouseTasks,
  patchWarehouseTask,
  type WarehouseTask,
} from "@/api/warehouseTasks.ts"
import { ApiError } from "@/client/index.ts"
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

export const Route = createFileRoute("/_layout/warehouse-tasks")({
  component: WarehouseTasksPage,
})

const STATUS_OPTIONS = [
  { value: SELECT_ALL_VALUE, label: "Все статусы" },
  { value: "pending", label: "pending" },
  { value: "in_progress", label: "in_progress" },
  { value: "completed", label: "completed" },
  { value: "cancelled", label: "cancelled" },
] as const

function WarehouseTasksPage() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("")

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
    <div className="mx-auto w-full max-w-6xl px-2 py-6 md:px-4 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">
        Складские задания
      </h1>
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
      </div>

      {listQ.isPending ? (
        <Skeleton className="h-[240px]" />
      ) : listQ.isError ? (
        <p className="text-destructive">
          {listQ.error instanceof ApiError
            ? listQ.error.message
            : "Не удалось загрузить задания"}
        </p>
      ) : (
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
      )}
    </div>
  )
}

/** Очередь заданий склада и состояние виртуальных сотрудников. */

import { Card, CardContent } from "@/components/ui/card.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { cn } from "@/lib/utils"
import {
  formatDuration,
  taskKindLabel,
  taskStatusLabel,
  workerRoleLabel,
  workerStatusLabel,
} from "./simFormat.ts"
import { useSimData } from "./useDeviceSimulation.ts"

export function TasksPanel() {
  const data = useSimData()
  const active = data.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
  const done = data.tasks
    .filter((task) => task.status === "done")
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    .slice(0, 15)
  const deviceNames = new Map(
    data.devices.map((device) => [device.id, device.name]),
  )
  const workerNames = new Map(
    data.workers.map((worker) => [worker.id, worker.name]),
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-6">
        <section>
          <h3 className="font-heading mb-2 text-sm font-semibold">
            Активные задания ({active.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Маршрут</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Исполнитель</TableHead>
                  <TableHead className="text-right">В работе</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.slice(0, 30).map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">
                      {taskKindLabel(task.kind)}
                      {task.priority >= 5 && (
                        <span className="ml-1 text-xs text-destructive">
                          приоритет
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.fromLabel} → {task.toLabel}
                    </TableCell>
                    <TableCell
                      className={cn(
                        task.status === "pending"
                          ? "text-amber-600 dark:text-amber-400"
                          : "",
                      )}
                    >
                      {taskStatusLabel(task.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.deviceId
                        ? (deviceNames.get(task.deviceId) ?? task.deviceId)
                        : "—"}
                      {task.workerId
                        ? `, ${workerNames.get(task.workerId) ?? task.workerId}`
                        : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDuration(data.timeSec - task.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {active.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Очередь заданий пуста
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section>
          <h3 className="font-heading mb-2 text-sm font-semibold">
            Завершённые задания
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Маршрут</TableHead>
                  <TableHead>Исполнитель</TableHead>
                  <TableHead className="text-right">Длительность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {done.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>{taskKindLabel(task.kind)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.fromLabel} → {task.toLabel}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.deviceId
                        ? (deviceNames.get(task.deviceId) ?? task.deviceId)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDuration(
                        (task.doneAt ?? 0) -
                          (task.assignedAt ?? task.createdAt),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {done.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      Пока ничего не завершено
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <Card className="h-fit bg-muted/30 ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h3 className="font-heading mb-2 text-sm font-semibold">
            Смена ({data.workers.filter((w) => w.status === "busy").length}{" "}
            занято из {data.workers.length})
          </h3>
          <ul className="space-y-1.5 text-sm">
            {data.workers.map((worker) => (
              <li
                key={worker.id}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {worker.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {workerRoleLabel(worker.role)}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-xs",
                    worker.status === "busy"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : worker.status === "break"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {workerStatusLabel(worker.status)} · {worker.tasksDone}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

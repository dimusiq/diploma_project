/**
 * Список заявок на обслуживание и ремонт (Work Order) с фильтрами по статусу, приоритету, исполнителю.
 */

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FaPlus } from "react-icons/fa"
import {
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  workOrdersApi,
} from "@/api/workOrders.ts"
import { UsersService } from "@/client/index.ts"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { CreateWorkOrderDialog } from "@/components/Equipment/CreateWorkOrderDialog.tsx"
import { WorkOrderDetailDrawer } from "@/components/Equipment/WorkOrderDetailDrawer.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { getPriorityLabel, getWorkOrderStatusLabel } from "@/lib/statusLabels.ts"

export function WorkOrderList({
  selectedId = null,
  onSelectedIdChange,
}: {
  selectedId?: string | null
  onSelectedIdChange?: (id: string | null) => void
} = {}) {
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [priorityFilter, setPriorityFilter] = useState<string>("")
  const [createOpen, setCreateOpen] = useState(false)
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const activeId = onSelectedIdChange ? selectedId : localSelectedId
  const setActiveId = (id: string | null) => {
    if (onSelectedIdChange) onSelectedIdChange(id)
    else setLocalSelectedId(id)
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "work-orders",
      {
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      },
    ],
    queryFn: () =>
      workOrdersApi.list({
        limit: 100,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      }),
    // Держим предыдущие данные на экране во время refetch,
    // чтобы таблица не "прыгала" при изменении фильтров.
    placeholderData: (prev) => prev,
  })

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 200 }),
  })
  const users = usersData?.data ?? []

  const orders = data?.data ?? []
  const count = data?.count ?? 0

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outlineSky" size="sm" onClick={() => setCreateOpen(true)}>
            <span className="inline-flex items-center gap-2">
              <FaPlus />
              Создать заявку
            </span>
          </Button>
          <Select
            value={toSelectAll(statusFilter)}
            onValueChange={(v) => setStatusFilter(fromSelectAll(v))}
          >
            <SelectTrigger className="h-9 min-w-[140px] text-sm">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL_VALUE}>Все статусы</SelectItem>
              {Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={toSelectAll(priorityFilter)}
            onValueChange={(v) => setPriorityFilter(fromSelectAll(v))}
          >
            <SelectTrigger className="h-9 min-w-[130px] text-sm">
              <SelectValue placeholder="Приоритет" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL_VALUE}>Все приоритеты</SelectItem>
              {Object.entries(WORK_ORDER_PRIORITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {count > 0 && (
          <p className="text-sm text-muted-foreground">Заявок: {count}</p>
        )}
      </div>

      <FetchingIndicator active={isFetching && !!data} mb={2} />

      <CreateWorkOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
      />

      {activeId && (
        <WorkOrderDetailDrawer
          workOrderId={activeId}
          open={!!activeId}
          onOpenChange={(open) => !open && setActiveId(null)}
        />
      )}

      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Заявок пока нет. Нажмите «Создать заявку», чтобы добавить заявку на
          обслуживание или ремонт.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Техника</TableHead>
                <TableHead>Заголовок</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Исполнитель</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Создана</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  onClick={() => setActiveId(order.id)}
                >
                  <TableCell>
                    <span className="font-medium">
                      {order.equipment_name || "—"}
                    </span>
                  </TableCell>
                  <TableCell>{order.title}</TableCell>
                  <TableCell>
                    {getWorkOrderStatusLabel(order.status)}
                  </TableCell>
                  <TableCell>
                    {getPriorityLabel(order.priority)}
                  </TableCell>
                  <TableCell>{order.assigned_to_email ?? "—"}</TableCell>
                  <TableCell>
                    {order.due_at
                      ? new Date(order.due_at).toLocaleDateString("ru-RU")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(order.created_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

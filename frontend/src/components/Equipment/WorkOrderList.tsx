/**
 * Список заявок на обслуживание и ремонт (Work Order) с фильтрами по статусу, приоритету, исполнителю.
 */
import {
  Box,
  Button,
  Flex,
  Table,
  Text,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FaPlus } from "react-icons/fa"

import {
  workOrdersApi,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "@/api/workOrders.ts"
import { UsersService } from "@/client/index.ts"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { CreateWorkOrderDialog } from "@/components/Equipment/CreateWorkOrderDialog.tsx"
import { WorkOrderDetailDrawer } from "@/components/Equipment/WorkOrderDetailDrawer.tsx"

export function WorkOrderList() {
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [priorityFilter, setPriorityFilter] = useState<string>("")
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Flex gap={2} align="center" wrap="wrap">
          <Button variant="solid" size="sm" onClick={() => setCreateOpen(true)}>
            <Flex as="span" align="center" gap={2}>
              <Box as={FaPlus} />
              Создать заявку
            </Flex>
          </Button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
              minWidth: "140px",
              fontSize: "14px",
            }}
          >
            <option value="">Все статусы</option>
            {Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
              minWidth: "130px",
              fontSize: "14px",
            }}
          >
            <option value="">Все приоритеты</option>
            {Object.entries(WORK_ORDER_PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Flex>
        {count > 0 && (
          <Text fontSize="sm" color="fg.muted">
            Заявок: {count}
          </Text>
        )}
      </Flex>

      <FetchingIndicator active={isFetching && !!data} mb={2} />

      <CreateWorkOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
      />

      {selectedId && (
        <WorkOrderDetailDrawer
          workOrderId={selectedId}
          open={!!selectedId}
          onOpenChange={(open) => !open && setSelectedId(null)}
        />
      )}

      {isLoading && !data ? (
        <Text color="fg.muted">Загрузка…</Text>
      ) : orders.length === 0 ? (
        <Text color="fg.muted">
          Заявок пока нет. Нажмите «Создать заявку», чтобы добавить заявку на
          обслуживание или ремонт.
        </Text>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Техника</Table.ColumnHeader>
                <Table.ColumnHeader>Заголовок</Table.ColumnHeader>
                <Table.ColumnHeader>Статус</Table.ColumnHeader>
                <Table.ColumnHeader>Приоритет</Table.ColumnHeader>
                <Table.ColumnHeader>Исполнитель</Table.ColumnHeader>
                <Table.ColumnHeader>Срок</Table.ColumnHeader>
                <Table.ColumnHeader>Создана</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {orders.map((order) => (
                <Table.Row
                  key={order.id}
                  cursor="pointer"
                  _hover={{ bg: "gray.50" }}
                  _dark={{ _hover: { bg: "whiteAlpha.100" } }}
                  onClick={() => setSelectedId(order.id)}
                >
                  <Table.Cell>
                    <Text fontWeight="medium">
                      {order.equipment_name || "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{order.title}</Table.Cell>
                  <Table.Cell>
                    {WORK_ORDER_STATUS_LABELS[order.status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? order.status}
                  </Table.Cell>
                  <Table.Cell>
                    {WORK_ORDER_PRIORITY_LABELS[order.priority as keyof typeof WORK_ORDER_PRIORITY_LABELS] ?? order.priority}
                  </Table.Cell>
                  <Table.Cell>{order.assigned_to_email ?? "—"}</Table.Cell>
                  <Table.Cell>
                    {order.due_at
                      ? new Date(order.due_at).toLocaleDateString("ru-RU")
                      : "—"}
                  </Table.Cell>
                  <Table.Cell>
                    {new Date(order.created_at).toLocaleDateString("ru-RU")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  )
}

import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  NativeSelect,
  Table,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  type WarehouseTask,
  fetchWarehouseTasks,
  patchWarehouseTask,
} from "@/api/warehouseTasks.ts"
import { ApiError } from "@/client/index.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

export const Route = createFileRoute("/_layout/warehouse-tasks")({
  component: WarehouseTasksPage,
})

const STATUS_OPTIONS = [
  { value: "", label: "Все статусы" },
  { value: "pending", label: "pending" },
  { value: "in_progress", label: "in_progress" },
  { value: "completed", label: "completed" },
  { value: "cancelled", label: "cancelled" },
]

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
    mutationFn: ({
      id,
      status,
    }: {
      id: string
      status: string
    }) => patchWarehouseTask(id, { status }),
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
    <Container maxW="6xl" py={{ base: 6, md: 10 }} px={{ base: 2, md: 4 }}>
      <Heading size="lg" mb={2}>
        Складские задания
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={6}>
        Назначение и смена статуса (нужны права warehouse.tasks.*).
      </Text>

      <Flex mb={4} gap={3} align="center" flexWrap="wrap">
        <NativeSelect.Root width={{ base: "full", sm: "220px" }}>
          <NativeSelect.Field
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Flex>

      {listQ.isPending ? (
        <Skeleton h="240px" />
      ) : listQ.isError ? (
        <Text color="red.fg">
          {listQ.error instanceof ApiError
            ? listQ.error.message
            : "Не удалось загрузить задания"}
        </Text>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm" variant="line">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Тип</Table.ColumnHeader>
                <Table.ColumnHeader>Статус</Table.ColumnHeader>
                <Table.ColumnHeader>Приоритет</Table.ColumnHeader>
                <Table.ColumnHeader>Обновлено</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Действия</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(listQ.data?.data ?? []).map((t: WarehouseTask) => (
                <Table.Row key={t.id}>
                  <Table.Cell>{t.task_type}</Table.Cell>
                  <Table.Cell>
                    <Badge size="sm">{t.status}</Badge>
                  </Table.Cell>
                  <Table.Cell>{t.priority}</Table.Cell>
                  <Table.Cell fontSize="xs">
                    {new Date(t.updated_at).toLocaleString()}
                  </Table.Cell>
                  <Table.Cell textAlign="right">
                    <Flex gap={1} justify="flex-end" flexWrap="wrap">
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
                        colorPalette="green"
                        variant="outline"
                        loading={patchMut.isPending}
                        disabled={t.status === "completed"}
                        onClick={() =>
                          patchMut.mutate({ id: t.id, status: "completed" })
                        }
                      >
                        Готово
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          {listQ.data?.data.length === 0 ? (
            <Text mt={4} color="fg.muted" fontSize="sm">
              Нет заданий для выбранного фильтра.
            </Text>
          ) : null}
        </Box>
      )}
    </Container>
  )
}

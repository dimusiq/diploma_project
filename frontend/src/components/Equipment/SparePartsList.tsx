/**
 * Запчасти: таблица с минимальными остатками и алертами (остаток <= min_quantity).
 */

import {
  Badge,
  Box,
  Button,
  Flex,
  Input,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiAlertTriangle, FiPlus } from "react-icons/fi"
import { sparePartsApi, type SparePartCreate, type SparePartPublic } from "@/api/spareParts.ts"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

const PER_PAGE = 20

function isBelowMin(part: SparePartPublic): boolean {
  const min = part.min_quantity
  if (min == null) return false
  return part.quantity <= min
}

export function SparePartsList() {
  const toast = useCustomToast()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<SparePartCreate>({
    title: "",
    sku: "",
    description: "",
    quantity: 0,
    min_quantity: undefined,
    unit: "",
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["spare-parts", page, alertsOnly],
    queryFn: () =>
      sparePartsApi.list({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        below_min: alertsOnly || undefined,
        sort_by: "title",
        sort_order: "asc",
      }),
    // При переключении "Только алерты" / "Все позиции" и пагинации
    // держим предыдущие данные на экране, чтобы список не прыгал.
    placeholderData: (prev) => prev,
  })

  const createMutation = useMutation({
    mutationFn: (body: SparePartCreate) => sparePartsApi.create(body),
    onSuccess: () => {
      toast.showSuccessToast("Запчасть добавлена")
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] })
      setCreateOpen(false)
      setForm({ title: "", sku: "", description: "", quantity: 0, min_quantity: undefined, unit: "" })
    },
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const parts = data?.data ?? []
  const count = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(count / PER_PAGE))

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.showErrorToast("Введите название")
      return
    }
    createMutation.mutate({
      title: form.title.trim(),
      sku: form.sku?.trim() || null,
      description: form.description?.trim() || null,
      quantity: form.quantity ?? 0,
      min_quantity: form.min_quantity != null ? form.min_quantity : null,
      unit: form.unit?.trim() || null,
    })
  }

  return (
    <VStack align="stretch" gap={4}>
      <Flex gap={2} align="center" flexWrap="wrap">
        <Button
          size="sm"
          variant="solid"
          colorPalette="blue"
          onClick={() => setCreateOpen(true)}
        >
          <Flex as="span" align="center" gap={1.5}>
            <FiPlus />
            Добавить запчасть
          </Flex>
        </Button>
        <Button
          size="sm"
          variant={alertsOnly ? "solid" : "outline"}
          colorPalette="blue"
          onClick={() => {
            setAlertsOnly(true)
            setPage(1)
          }}
        >
          Только алерты (ниже мин. остатка)
        </Button>
        <Button
          size="sm"
          variant={alertsOnly ? "outline" : "solid"}
          colorPalette="blue"
          onClick={() => {
            setAlertsOnly(false)
            setPage(1)
          }}
        >
          Все позиции
        </Button>
      </Flex>

      <DialogRoot open={createOpen} onOpenChange={(e) => setCreateOpen(e.open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить запчасть</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <DialogBody>
              <VStack gap={3} align="stretch">
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Название *
                  </Text>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Название запчасти"
                    size="sm"
                    maxLength={255}
                  />
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Артикул
                  </Text>
                  <Input
                    value={form.sku ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="Артикул"
                    size="sm"
                    maxLength={64}
                  />
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Описание
                  </Text>
                  <Input
                    value={form.description ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Описание"
                    size="sm"
                    maxLength={512}
                  />
                </Box>
                <Flex gap={3}>
                  <Box flex={1}>
                    <Text fontSize="sm" mb={1} fontWeight="medium">
                      Остаток
                    </Text>
                    <Input
                      type="number"
                      min={0}
                      value={form.quantity ?? 0}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 0 }))}
                      size="sm"
                    />
                  </Box>
                  <Box flex={1}>
                    <Text fontSize="sm" mb={1} fontWeight="medium">
                      Мин. остаток (алерт)
                    </Text>
                    <Input
                      type="number"
                      min={0}
                      value={form.min_quantity ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          min_quantity: e.target.value === "" ? undefined : parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      placeholder="—"
                      size="sm"
                    />
                  </Box>
                  <Box flex={1}>
                    <Text fontSize="sm" mb={1} fontWeight="medium">
                      Ед. изм.
                    </Text>
                    <Input
                      value={form.unit ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="шт."
                      size="sm"
                      maxLength={32}
                    />
                  </Box>
                </Flex>
              </VStack>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(false)}>
                Отмена
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="solid"
                colorPalette="blue"
                loading={createMutation.isPending}
                disabled={!form.title.trim()}
              >
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>

      <FetchingIndicator active={isFetching && !!data} />

      {isLoading && !data ? (
        <Text color="fg.muted">Загрузка…</Text>
      ) : parts.length === 0 ? (
        <Text color="fg.muted">
          {alertsOnly
            ? "Нет позиций с остатком ниже минимального."
            : "Нет запчастей на складе запчастей. Добавьте позиции."}
        </Text>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Название</Table.ColumnHeader>
                <Table.ColumnHeader>Артикул</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Остаток</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Мин. остаток</Table.ColumnHeader>
                <Table.ColumnHeader>Ед.</Table.ColumnHeader>
                <Table.ColumnHeader>Статус</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {parts.map((part) => {
                const alert = isBelowMin(part)
                return (
                  <Table.Row
                    key={part.id}
                    _hover={{ bg: "gray.50" }}
                    _dark={{ _hover: { bg: "gray.800" } }}
                  >
                    <Table.Cell fontWeight="medium">{part.title}</Table.Cell>
                    <Table.Cell color="fg.muted">{part.sku ?? "—"}</Table.Cell>
                    <Table.Cell textAlign="end">{part.quantity}</Table.Cell>
                    <Table.Cell textAlign="end">
                      {part.min_quantity != null ? part.min_quantity : "—"}
                    </Table.Cell>
                    <Table.Cell color="fg.muted">{part.unit ?? "—"}</Table.Cell>
                    <Table.Cell>
                      {alert ? (
                        <Badge colorPalette="red" gap={1}>
                          <FiAlertTriangle />
                          Ниже минимума
                        </Badge>
                      ) : (
                        <Text color="fg.muted" fontSize="sm">
                          Норма
                        </Text>
                      )}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {totalPages > 1 && (
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          page={page}
          onPageChange={(e) => setPage(e.page)}
        >
          <Flex gap={2} align="center">
            <PaginationPrevTrigger asChild>
              <Button size="sm" variant="outline">
                Назад
              </Button>
            </PaginationPrevTrigger>
            <PaginationItems />
            <PaginationNextTrigger asChild>
              <Button size="sm" variant="outline">
                Вперёд
              </Button>
            </PaginationNextTrigger>
          </Flex>
        </PaginationRoot>
      )}
    </VStack>
  )
}

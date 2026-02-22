import {
  Box,
  Button,
  Container,
  EmptyState,
  Flex,
  Heading,
  Input,
  Table,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { FiDownload, FiSearch } from "react-icons/fi"
import { z } from "zod"
import { downloadItemsExport } from "@/api/exportItems.ts"
import { openShippingNotePdf } from "@/api/printPdf.ts"
import { CategoriesService, ItemsService } from "@/client/index.ts"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu.tsx"
import { ItemSelectionToolbar } from "@/components/Common/ItemSelectionToolbar.tsx"
import { ShortId } from "@/components/Common/ShortId.tsx"
import { MoveItemsDialog } from "@/components/Items/MoveItemsDialog.tsx"
import PendingItems from "@/components/Pending/PendingItems.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { useOptimisticItems } from "@/hooks/useOptimisticItems.ts"

const warehouseSearchSchema = z.object({
  page: z.number().catch(1),
  search: z.string().catch(""),
  category_id: z.string().catch(""),
})

const PER_PAGE = 5

function getItemsQueryOptions({
  page,
  search,
  category_id,
}: {
  page: number
  search: string
  category_id: string
}) {
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        status: "warehouse",
        search: search || undefined,
        category_id: category_id || undefined,
      }),
    queryKey: ["items", "warehouse", { page, search, category_id }],
  }
}

export const Route = createFileRoute("/_layout/warehouse")({
  component: Warehouse,
  validateSearch: (s) => warehouseSearchSchema.parse(s),
})

function WarehouseTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { showErrorToast } = useCustomToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const { page, search, category_id } = Route.useSearch()

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions({ page, search, category_id }),
    placeholderData: (prev) => prev,
  })

  const setSearchParams = (updates: {
    page?: number
    search?: string
    category_id?: string
  }) =>
    (navigate as unknown as (opts: { search: (prev: z.infer<typeof warehouseSearchSchema>) => z.infer<typeof warehouseSearchSchema> }) => void)({
      search: (prev) => ({ ...prev, ...updates }),
    })

  const items = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0
  const [optimisticItems, addOptimisticRemove] = useOptimisticItems(items)

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    const ids = optimisticItems.map((i) => i.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [optimisticItems, selectedIds])

  const isAllSelected =
    optimisticItems.length > 0 &&
    optimisticItems.every((i) => selectedIds.has(i.id))
  const isSomeSelected = optimisticItems.some((i) => selectedIds.has(i.id))

  const handlePrintShippingNote = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setIsPrinting(true)
    try {
      await openShippingNotePdf(ids)
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Ошибка печати накладной")
    } finally {
      setIsPrinting(false)
    }
  }, [selectedIds, showErrorToast])

  const handleMoveSuccess = useCallback(() => setSelectedIds(new Set()), [])

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      setIsExporting(true)
      try {
        await downloadItemsExport({
          format,
          status: "warehouse",
          search: search || undefined,
          category_id: category_id || undefined,
        })
      } catch (e) {
        showErrorToast(e instanceof Error ? e.message : "Ошибка выгрузки")
      } finally {
        setIsExporting(false)
      }
    },
    [search, category_id, showErrorToast],
  )

  if (isLoading) return <PendingItems />

  const hasActiveFilters = !!(search?.trim() || category_id)

  if (optimisticItems.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiSearch />
          </EmptyState.Indicator>
          <VStack textAlign="center" gap={3}>
            <EmptyState.Title>
              {hasActiveFilters
                ? "Ничего не найдено по заданным фильтрам"
                : "Нет товаров на складе"}
            </EmptyState.Title>
            <EmptyState.Description>
              {hasActiveFilters
                ? "Измените условия поиска или сбросьте фильтры."
                : "Переведите товары из «Поступления» на склад, чтобы они отобразились здесь."}
            </EmptyState.Description>
            {hasActiveFilters ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSearchParams({ search: "", category_id: "", page: 1 })
                }
              >
                Сбросить фильтры
              </Button>
            ) : (
              <RouterLink to="/items">
                <Button size="sm" variant="solid" mt={2}>
                  Перейти в поступления
                </Button>
              </RouterLink>
            )}
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    )
  }

  return (
    <>
      <ItemSelectionToolbar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onPrintShippingNote={handlePrintShippingNote}
        onMove={() => setMoveDialogOpen(true)}
        isPrinting={isPrinting}
      />
      <Flex gap={3} mb={4} flexWrap="wrap" align="center">
        <Input
          placeholder="Поиск по названию, описанию, артикулу, штрихкоду..."
          value={search}
          onChange={(e) => setSearchParams({ search: e.target.value, page: 1 })}
          maxW="xs"
          size="sm"
        />
        <select
          value={category_id}
          onChange={(e) =>
            setSearchParams({ category_id: e.target.value, page: 1 })
          }
          style={{
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--chakra-colors-border)",
            minWidth: "160px",
            fontSize: "14px",
          }}
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <MenuRoot>
          <MenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={isExporting}>
              <Flex as="span" gap={2} align="center">
                <Box as={FiDownload} />
                Выгрузить
              </Flex>
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem value="csv" onClick={() => handleExport("csv")}>
              CSV
            </MenuItem>
            <MenuItem value="xlsx" onClick={() => handleExport("xlsx")}>
              Excel
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </Flex>
      <Box overflowX="auto" w="100%">
        <Table.Root size={{ base: "sm", md: "md" }} minW={{ base: "800px" }}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader w="xs">
                <Checkbox
                  checked={
                    isAllSelected
                      ? true
                      : isSomeSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </Table.ColumnHeader>
              <Table.ColumnHeader w="sm">ID</Table.ColumnHeader>
              <Table.ColumnHeader w="sm">Название</Table.ColumnHeader>
              <Table.ColumnHeader w="sm">Описание</Table.ColumnHeader>
              <Table.ColumnHeader w="xs">Кол-во</Table.ColumnHeader>
              <Table.ColumnHeader w="sm">Артикул</Table.ColumnHeader>
              <Table.ColumnHeader w="xs">Ед.</Table.ColumnHeader>
              <Table.ColumnHeader w="sm">Категория</Table.ColumnHeader>
              <Table.ColumnHeader w="sm">Действия</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {optimisticItems.map((item) => (
              <Table.Row key={item.id} opacity={isPlaceholderData ? 0.5 : 1}>
                <Table.Cell>
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleOne(item.id)}
                    aria-label={`Выбрать ${item.title}`}
                  />
                </Table.Cell>
                <Table.Cell>
                  <ShortId id={item.id} />
                </Table.Cell>
                <Table.Cell>{item.title}</Table.Cell>
                <Table.Cell>{item.description || "N/A"}</Table.Cell>
                <Table.Cell>{item.quantity ?? 1}</Table.Cell>
                <Table.Cell>{item.sku || "—"}</Table.Cell>
                <Table.Cell>{item.unit || "—"}</Table.Cell>
                <Table.Cell>
                  {item.category_id
                    ? (categories.find((c) => c.id === item.category_id)
                        ?.name ?? "—")
                    : "—"}
                </Table.Cell>
                <Table.Cell>
                  <ItemActionsMenu item={item} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
      <Flex justifyContent="flex-end" mt={4}>
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page }) => setSearchParams({ page })}
        >
          <Flex>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
      <MoveItemsDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        selectedIds={Array.from(selectedIds)}
        selectedItems={optimisticItems
          .filter((i) => selectedIds.has(i.id))
          .map((i) => ({ id: i.id, status: i.status }))}
        onSuccess={handleMoveSuccess}
        onOptimisticRemove={addOptimisticRemove}
      />
    </>
  )
}

function Warehouse() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12}>
        Склад
      </Heading>
      <WarehouseTable />
    </Container>
  )
}

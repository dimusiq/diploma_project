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
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import {
  FiChevronDown,
  FiChevronUp,
  FiDownload,
  FiSearch,
} from "react-icons/fi"
import { z } from "zod"

import { downloadItemsExport } from "@/api/exportItems.ts"
import { CategoriesService, ItemsService } from "@/client/index.ts"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu.tsx"
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

const shippedSearchSchema = z.object({
  page: z.number().catch(1),
  search: z.string().catch(""),
  category_id: z.string().catch(""),
  sort_by: z
    .enum(["title", "created_at", "quantity", "sku", "description", "unit"])
    .catch("created_at"),
  sort_order: z.enum(["asc", "desc"]).catch("desc"),
})

const PER_PAGE = 5

type ShippedSearch = z.infer<typeof shippedSearchSchema>

function getItemsQueryOptions(params: ShippedSearch) {
  const { page, search, category_id, sort_by, sort_order } = params
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        status: "shipped",
        search: search || undefined,
        category_id: category_id || undefined,
        sort_by: sort_by || undefined,
        sort_order: sort_order || undefined,
      }),
    queryKey: ["items", "shipped", params],
  }
}

export const Route = createFileRoute("/_layout/shipped")({
  component: Shipped,
  validateSearch: (s) => shippedSearchSchema.parse(s),
})

function ShippedTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { showErrorToast } = useCustomToast()
  const [isExporting, setIsExporting] = useState(false)
  const searchParams = Route.useSearch() as ShippedSearch
  const { search, category_id } = searchParams

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions(searchParams),
    placeholderData: (prev) => prev,
  })

  type SortField = "title" | "created_at" | "quantity" | "sku" | "description" | "unit"
  const handleSort = (field: SortField) => {
    ;(navigate as unknown as (opts: { search: (prev: ShippedSearch) => ShippedSearch }) => void)({
      search: (prev) => ({
        ...prev,
        sort_by: field,
        sort_order:
          prev.sort_by === field && prev.sort_order === "desc" ? "asc" : "desc",
        page: 1,
      }),
    })
  }
  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <Table.ColumnHeader
      w="sm"
      cursor="pointer"
      onClick={() => handleSort(field)}
      _hover={{ bg: "gray.100" }}
      _dark={{ _hover: { bg: "gray.800" } }}
      whiteSpace="nowrap"
      userSelect="none"
    >
      {label}
      {searchParams.sort_by === field ? (
        searchParams.sort_order === "desc" ? (
          <Box as={FiChevronDown} display="inline" ml={1} />
        ) : (
          <Box as={FiChevronUp} display="inline" ml={1} />
        )
      ) : null}
    </Table.ColumnHeader>
  )

  const setSearchParams = (updates: Partial<ShippedSearch>) =>
    (navigate as unknown as (opts: { search: (prev: ShippedSearch) => ShippedSearch }) => void)({
      search: (prev) => ({ ...prev, ...updates }),
    })

  const items = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    const ids = items.map((i) => i.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [items, selectedIds])

  const isAllSelected =
    items.length > 0 && items.every((i) => selectedIds.has(i.id))
  const isSomeSelected = items.some((i) => selectedIds.has(i.id))

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      setIsExporting(true)
      try {
        await downloadItemsExport({
          format,
          status: "shipped",
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

  if (items.length === 0) {
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
                : "Нет отгруженных товаров"}
            </EmptyState.Title>
            {hasActiveFilters && (
              <>
                <EmptyState.Description>
                  Измените условия поиска или сбросьте фильтры.
                </EmptyState.Description>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSearchParams({ search: "", category_id: "", page: 1 })
                  }
                >
                  Сбросить фильтры
                </Button>
              </>
            )}
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    )
  }

  return (
    <>
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
              <SortHeader field="title" label="Название" />
              <SortHeader field="description" label="Описание" />
              <SortHeader field="quantity" label="Кол-во" />
              <SortHeader field="sku" label="Артикул" />
              <SortHeader field="unit" label="Ед." />
              <Table.ColumnHeader w="sm">Категория</Table.ColumnHeader>
              <SortHeader field="created_at" label="Дата" />
              <Table.ColumnHeader w="sm">Действия</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row
                key={item.id}
                opacity={isPlaceholderData ? 0.5 : 1}
                _hover={{ bg: "gray.50" }}
                _dark={{ _hover: { bg: "whiteAlpha.100" } }}
              >
                <Table.Cell>
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleOne(item.id)}
                    aria-label={`Выбрать ${item.title}`}
                  />
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
                <Table.Cell whiteSpace="nowrap">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleDateString("ru-RU")
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
    </>
  )
}

function Shipped() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12}>
        Отгружено
      </Heading>
      <ShippedTable />
    </Container>
  )
}

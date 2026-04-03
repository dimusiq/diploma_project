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
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { Input } from "@/components/ui/input.tsx"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { cn } from "@/lib/utils.ts"

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
    <TableHead
      className="w-32 cursor-pointer select-none whitespace-nowrap hover:bg-muted/80 dark:hover:bg-muted/40"
      onClick={() => handleSort(field)}
    >
      {label}
      {searchParams.sort_by === field ? (
        searchParams.sort_order === "desc" ? (
          <FiChevronDown className="ml-1 inline size-4" />
        ) : (
          <FiChevronUp className="ml-1 inline size-4" />
        )
      ) : null}
    </TableHead>
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
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <FiSearch className="size-10 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-semibold">
            {hasActiveFilters
              ? "Ничего не найдено по заданным фильтрам"
              : "Нет отгруженных товаров"}
          </h3>
          {hasActiveFilters && (
            <>
              <p className="max-w-md text-sm text-muted-foreground">
                Измените условия поиска или сбросьте фильтры.
              </p>
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
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Поиск по названию, описанию, артикулу, штрихкоду..."
          value={search}
          onChange={(e) => setSearchParams({ search: e.target.value, page: 1 })}
          className="h-8 max-w-xs text-sm"
        />
        <select
          value={category_id}
          onChange={(e) =>
            setSearchParams({ category_id: e.target.value, page: 1 })
          }
          className="min-w-[160px] rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
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
              <span className="inline-flex items-center gap-2">
                <FiDownload className="size-4" />
                Выгрузить
              </span>
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
      </div>
      <div className="w-full overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">
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
              </TableHead>
              <SortHeader field="title" label="Название" />
              <SortHeader field="description" label="Описание" />
              <SortHeader field="quantity" label="Кол-во" />
              <SortHeader field="sku" label="Артикул" />
              <SortHeader field="unit" label="Ед." />
              <TableHead className="w-32">Категория</TableHead>
              <SortHeader field="created_at" label="Дата" />
              <TableHead className="w-32">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  "hover:bg-muted/50",
                  isPlaceholderData && "opacity-50",
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleOne(item.id)}
                    aria-label={`Выбрать ${item.title}`}
                  />
                </TableCell>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.description || "N/A"}</TableCell>
                <TableCell>{item.quantity ?? 1}</TableCell>
                <TableCell>{item.sku || "—"}</TableCell>
                <TableCell>{item.unit || "—"}</TableCell>
                <TableCell>
                  {item.category_id
                    ? (categories.find((c) => c.id === item.category_id)
                        ?.name ?? "—")
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleDateString("ru-RU")
                    : "—"}
                </TableCell>
                <TableCell>
                  <ItemActionsMenu item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex justify-end">
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page }) => setSearchParams({ page })}
        >
          <div className="flex">
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </div>
        </PaginationRoot>
      </div>
    </>
  )
}

function Shipped() {
  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading pt-12 text-2xl font-semibold">Отгружено</h1>
      <ShippedTable />
    </div>
  )
}

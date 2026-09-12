import { useQuery } from "@tanstack/react-query"
import {
  Link as RouterLink,
  useNavigate,
  useSearch,
} from "@tanstack/react-router"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { FiDownload, FiPrinter, FiSearch } from "react-icons/fi"

import { downloadItemsExport } from "@/api/exportItems.ts"
import { openShippingNotePdf } from "@/api/printPdf.ts"
import type { ItemPublic } from "@/client/index.ts"
import { CategoriesService, ItemsService } from "@/client/index.ts"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu.tsx"
import { ItemSelectionToolbar } from "@/components/Common/ItemSelectionToolbar.tsx"
import { MassEditItemsDialog } from "@/components/Items/MassEditItemsDialog.tsx"
import { MoveItemsDialog } from "@/components/Items/MoveItemsDialog.tsx"
import { type SortField, SortHeader } from "@/components/Items/SortHeader.tsx"
import PendingItems from "@/components/Pending/PendingItems.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
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
import useCustomToast from "@/hooks/useCustomToast.ts"
import { useOptimisticItems } from "@/hooks/useOptimisticItems.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { cn } from "@/lib/utils.ts"

const PER_PAGE = 25

export interface ItemDataTableProps {
  status?: string
  showCheckboxes?: boolean
  showExport?: boolean
  showMoveAction?: boolean
  showMassEdit?: boolean
  showPrintShippingNote?: boolean
  showPrintAllPage?: boolean
  showDateFilters?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyLink?: { to: string; label: string }
  extraColumns?: Array<{
    header: string
    render: (item: ItemPublic) => ReactNode
  }>
}

export function ItemDataTable({
  status,
  showCheckboxes,
  showExport,
  showMoveAction,
  showMassEdit,
  showPrintShippingNote,
  showPrintAllPage,
  showDateFilters,
  emptyTitle = "Нет данных",
  emptyDescription,
  emptyLink,
  extraColumns,
}: ItemDataTableProps) {
  const navigate = useNavigate()
  const { showErrorToast } = useCustomToast()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSearch = useSearch({ strict: false }) as Record<string, any>
  const page = (rawSearch.page as number) || 1
  const search = (rawSearch.search as string) || ""
  const categoryId = (rawSearch.category_id as string) || ""
  const createdAtFrom = (rawSearch.created_at_from as string) || ""
  const createdAtTo = (rawSearch.created_at_to as string) || ""
  const sortBy = (rawSearch.sort_by as SortField) || "created_at"
  const sortOrder = (rawSearch.sort_order as "asc" | "desc") || "desc"

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [massEditDialogOpen, setMassEditDialogOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  const setSearchParams = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updates: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (navigate as any)({
        search: (prev: Record<string, unknown>) => ({ ...prev, ...updates }),
      }),
    [navigate],
  )

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        status: status || undefined,
        search: search || undefined,
        category_id: categoryId || undefined,
        created_at_from: createdAtFrom || undefined,
        created_at_to: createdAtTo || undefined,
        sort_by: sortBy || undefined,
        sort_order: sortOrder || undefined,
      }),
    queryKey: [
      "items",
      {
        status,
        page,
        search,
        categoryId,
        createdAtFrom,
        createdAtTo,
        sortBy,
        sortOrder,
      },
    ],
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearchParams({ search: searchInput, page: 1 })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search, setSearchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = useCallback(
    (field: SortField) => {
      setSearchParams({
        sort_by: field,
        sort_order:
          sortBy === field && sortOrder === "desc" ? "asc" : "desc",
        page: 1,
      })
    },
    [sortBy, sortOrder, setSearchParams],
  )

  const items = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0
  const [optimisticItems, addOptimisticRemove] = useOptimisticItems(items)

  useEffect(() => {
    setSelectedIds(new Set())
  }, [
    page,
    search,
    categoryId,
    status,
    sortBy,
    sortOrder,
    createdAtFrom,
    createdAtTo,
  ])

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

  const handlePrintAllPage = useCallback(async () => {
    try {
      await openShippingNotePdf(optimisticItems.map((i) => i.id))
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Ошибка печати накладной")
    }
  }, [optimisticItems, showErrorToast])

  const handleMoveSuccess = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      setIsExporting(true)
      try {
        await downloadItemsExport({
          format,
          status: status || undefined,
          search: search || undefined,
          category_id: categoryId || undefined,
          created_at_from: createdAtFrom || undefined,
          created_at_to: createdAtTo || undefined,
        })
      } catch (e) {
        showErrorToast(e instanceof Error ? e.message : "Ошибка выгрузки")
      } finally {
        setIsExporting(false)
      }
    },
    [status, search, categoryId, createdAtFrom, createdAtTo, showErrorToast],
  )

  const handleExportSelected = useCallback(
    async (format: "csv" | "xlsx") => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      setIsExporting(true)
      try {
        await downloadItemsExport({ format, item_ids: ids })
      } catch (e) {
        showErrorToast(e instanceof Error ? e.message : "Ошибка выгрузки")
      } finally {
        setIsExporting(false)
      }
    },
    [selectedIds, showErrorToast],
  )

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4">
        <div className="flex flex-col items-center gap-3 py-8">
          <h3 className="font-heading text-base font-semibold">
            Не удалось загрузить список
          </h3>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <PendingItems />
  }

  const hasActiveFilters = !!(
    search?.trim() ||
    categoryId ||
    createdAtFrom ||
    createdAtTo
  )

  if (optimisticItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <FiSearch className="size-10 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-semibold">
            {hasActiveFilters
              ? "Ничего не найдено по заданным фильтрам"
              : emptyTitle}
          </h3>
          {(hasActiveFilters || emptyDescription) && (
            <p className="max-w-md text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Измените условия поиска или сбросьте фильтры."
                : emptyDescription}
            </p>
          )}
          {hasActiveFilters ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSearchParams({
                  search: "",
                  category_id: "",
                  created_at_from: "",
                  created_at_to: "",
                  page: 1,
                })
              }
            >
              Сбросить фильтры
            </Button>
          ) : emptyLink ? (
            <Button asChild size="sm" variant="outline" className="mt-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <RouterLink to={emptyLink.to as any}>
                {emptyLink.label}
              </RouterLink>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const showToolbar =
    showCheckboxes &&
    (showMoveAction || showPrintShippingNote || showMassEdit || showExport)

  return (
    <>
      {showToolbar && (
        <ItemSelectionToolbar
          selectedCount={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onPrintShippingNote={
            showPrintShippingNote ? handlePrintShippingNote : undefined
          }
          onMove={showMoveAction ? () => setMoveDialogOpen(true) : undefined}
          onMassEdit={
            showMassEdit ? () => setMassEditDialogOpen(true) : undefined
          }
          onExportSelected={showExport ? handleExportSelected : undefined}
          isPrinting={isPrinting}
          isExporting={isExporting}
        />
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Поиск по названию, описанию, артикулу, штрихкоду..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-8 max-w-xs text-sm"
        />
        <Select
          value={toSelectAll(categoryId)}
          onValueChange={(v) =>
            setSearchParams({ category_id: fromSelectAll(v), page: 1 })
          }
        >
          <SelectTrigger className="h-8 min-w-[160px] w-[min(100%,220px)] text-sm">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL_VALUE}>Все категории</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showDateFilters && (
          <>
            <Input
              type="date"
              className="h-8 max-w-40 text-sm"
              value={createdAtFrom}
              onChange={(e) =>
                setSearchParams({ created_at_from: e.target.value, page: 1 })
              }
              placeholder="Дата от"
            />
            <Input
              type="date"
              className="h-8 max-w-40 text-sm"
              value={createdAtTo}
              onChange={(e) =>
                setSearchParams({ created_at_to: e.target.value, page: 1 })
              }
              placeholder="Дата до"
            />
          </>
        )}
        {showPrintAllPage && (
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrintAllPage}
            disabled={optimisticItems.length === 0}
          >
            <span className="inline-flex items-center gap-2">
              <FiPrinter className="size-4" />
              Печать накладной (вся страница)
            </span>
          </Button>
        )}
        {showExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={isExporting}>
                <span className="inline-flex items-center gap-2">
                  <FiDownload className="size-4" />
                  Выгрузить
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => handleExport("csv")}>
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("xlsx")}>
                Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="w-full">
        <p className="mb-2 text-xs text-muted-foreground md:hidden">
          Свайпните влево для просмотра всех колонок
        </p>
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                {showCheckboxes && (
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
                )}
                <SortHeader
                  field="title"
                  label="Название"
                  currentField={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortHeader
                  field="description"
                  label="Описание"
                  currentField={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortHeader
                  field="quantity"
                  label="Кол-во"
                  currentField={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortHeader
                  field="sku"
                  label="Артикул"
                  currentField={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortHeader
                  field="unit"
                  label="Ед."
                  currentField={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHead className="w-32">Категория</TableHead>
                <SortHeader
                  field="created_at"
                  label="Дата"
                  currentField={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                {extraColumns?.map((col) => (
                  <TableHead key={col.header} className="w-32">
                    {col.header}
                  </TableHead>
                ))}
                <TableHead className="w-32">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {optimisticItems.map((item) => (
                <TableRow
                  key={item.id}
                  className={cn(
                    "hover:bg-muted/50",
                    isPlaceholderData && "opacity-50",
                  )}
                >
                  {showCheckboxes && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleOne(item.id)}
                        aria-label={`Выбрать ${item.title}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="max-w-sm truncate">
                    {item.title}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "max-w-[30%] truncate",
                      !item.description && "text-muted-foreground",
                    )}
                  >
                    {item.description || "N/A"}
                  </TableCell>
                  <TableCell>{item.quantity ?? 1}</TableCell>
                  <TableCell className="max-w-sm truncate">
                    {item.sku || "—"}
                  </TableCell>
                  <TableCell>{item.unit || "—"}</TableCell>
                  <TableCell className="max-w-sm truncate">
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
                  {extraColumns?.map((col) => (
                    <TableCell key={col.header}>{col.render(item)}</TableCell>
                  ))}
                  <TableCell>
                    <ItemActionsMenu item={item} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page: p }) => setSearchParams({ page: p })}
        >
          <div className="flex">
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </div>
        </PaginationRoot>
      </div>
      {showMoveAction && (
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
      )}
      {showMassEdit && (
        <MassEditItemsDialog
          open={massEditDialogOpen}
          onOpenChange={setMassEditDialogOpen}
          selectedIds={Array.from(selectedIds)}
          onSuccess={handleMoveSuccess}
        />
      )}
    </>
  )
}

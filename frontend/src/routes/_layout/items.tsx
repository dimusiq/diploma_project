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
import { openShippingNotePdf } from "@/api/printPdf.ts"
import { CategoriesService, ItemsService } from "@/client/index.ts"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu.tsx"
import { ItemSelectionToolbar } from "@/components/Common/ItemSelectionToolbar.tsx"
import AddItem from "@/components/Items/AddItem.tsx"
import EditItem from "@/components/Items/EditItem.tsx"
import { MassEditItemsDialog } from "@/components/Items/MassEditItemsDialog.tsx"
import { MoveItemsDialog } from "@/components/Items/MoveItemsDialog.tsx"
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
import { useOptimisticItems } from "@/hooks/useOptimisticItems.ts"
import { cn } from "@/lib/utils.ts"

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
  search: z.string().catch(""),
  category_id: z.string().catch(""),
  created_at_from: z.string().catch(""),
  created_at_to: z.string().catch(""),
  sort_by: z
    .enum(["title", "created_at", "quantity", "sku", "description", "unit"])
    .catch("created_at"),
  sort_order: z.enum(["asc", "desc"]).catch("desc"),
  open: z.string().optional(),
})

const PER_PAGE = 5

type ItemsSearch = z.infer<typeof itemsSearchSchema>

function getItemsQueryOptions(params: ItemsSearch & { status?: string }) {
  const {
    page,
    search,
    category_id,
    created_at_from,
    created_at_to,
    sort_by,
    sort_order,
    status,
  } = params
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        search: search || undefined,
        category_id: category_id || undefined,
        created_at_from: created_at_from || undefined,
        created_at_to: created_at_to || undefined,
        sort_by: sort_by || undefined,
        sort_order: sort_order || undefined,
        status: status || undefined,
      }),
    queryKey: ["items", params],
  }
}

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search),
})

function ItemsTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { showErrorToast } = useCustomToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [massEditDialogOpen, setMassEditDialogOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const searchParams = Route.useSearch() as ItemsSearch

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions(searchParams),
    placeholderData: (prevData) => prevData,
  })

  const setSearchParams = (updates: Partial<ItemsSearch>) =>
    (navigate as unknown as (opts: { search: (prev: ItemsSearch) => ItemsSearch }) => void)({
      search: (prev) => ({ ...prev, ...updates }),
    })

  type SortField = "title" | "created_at" | "quantity" | "sku" | "description" | "unit"

  const handleSort = (field: SortField) => {
    setSearchParams({
      sort_by: field,
      sort_order:
        searchParams.sort_by === field && searchParams.sort_order === "desc"
          ? "asc"
          : "desc",
      page: 1,
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

  const handleMoveSuccess = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      setIsExporting(true)
      try {
        await downloadItemsExport({
          format,
          status: undefined,
          search: searchParams.search || undefined,
          category_id: searchParams.category_id || undefined,
          created_at_from: searchParams.created_at_from || undefined,
          created_at_to: searchParams.created_at_to || undefined,
        })
      } catch (e) {
        showErrorToast(e instanceof Error ? e.message : "Ошибка выгрузки")
      } finally {
        setIsExporting(false)
      }
    },
    [searchParams, showErrorToast],
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
    searchParams.search?.trim() ||
    searchParams.category_id ||
    searchParams.created_at_from ||
    searchParams.created_at_to
  )

  if (optimisticItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <FiSearch className="size-10 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-semibold">
            {hasActiveFilters
              ? "Ничего не найдено по заданным фильтрам"
              : "Нет добавленных слотов"}
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Измените условия поиска или сбросьте фильтры."
              : "Добавьте слоты, чтобы они отображались здесь."}
          </p>
          {hasActiveFilters && (
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
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <ItemSelectionToolbar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onPrintShippingNote={handlePrintShippingNote}
        onMove={() => setMoveDialogOpen(true)}
        onMassEdit={() => setMassEditDialogOpen(true)}
        onExportSelected={handleExportSelected}
        isPrinting={isPrinting}
        isExporting={isExporting}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Поиск по названию, описанию, артикулу, штрихкоду..."
          value={searchParams.search}
          onChange={(e) => setSearchParams({ search: e.target.value, page: 1 })}
          className="h-8 max-w-xs text-sm"
        />
        <select
          value={searchParams.category_id}
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
        <Input
          type="date"
          className="h-8 max-w-[10rem] text-sm"
          value={searchParams.created_at_from}
          onChange={(e) =>
            setSearchParams({ created_at_from: e.target.value, page: 1 })
          }
          placeholder="Дата от"
        />
        <Input
          type="date"
          className="h-8 max-w-[10rem] text-sm"
          value={searchParams.created_at_to}
          onChange={(e) =>
            setSearchParams({ created_at_to: e.target.value, page: 1 })
          }
          placeholder="Дата до"
        />
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
      <div className="w-full">
        <p className="mb-2 text-xs text-muted-foreground md:hidden">
          Свайпните влево для просмотра всех колонок
        </p>
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
              {optimisticItems.map((item) => (
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
                  <TableCell className="max-w-sm truncate">{item.title}</TableCell>
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
          onPageChange={({ page }) => setSearchParams({ page })}
        >
          <div className="flex">
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </div>
        </PaginationRoot>
      </div>
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
      <MassEditItemsDialog
        open={massEditDialogOpen}
        onOpenChange={setMassEditDialogOpen}
        selectedIds={Array.from(selectedIds)}
        onSuccess={handleMoveSuccess}
      />
    </>
  )
}

function Items() {
  const searchParams = Route.useSearch() as ItemsSearch
  const navigate = useNavigate({ from: Route.fullPath })
  const openItemId = searchParams.open

  const { data: openItem } = useQuery({
    queryKey: ["item", openItemId],
    queryFn: () => ItemsService.readItem({ id: openItemId! }),
    enabled: Boolean(openItemId),
  })

  const clearOpenParam = useCallback(() => {
    (navigate as unknown as (opts: { search: (prev: ItemsSearch) => ItemsSearch }) => void)({
      search: (prev) => ({ ...prev, open: undefined }),
    })
  }, [navigate])

  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading pt-12 text-2xl font-semibold">Поступления</h1>
      <AddItem />
      <ItemsTable />
      {openItem && (
        <EditItem
          item={openItem}
          open={true}
          onOpenChange={({ open }) => {
            if (!open) clearOpenParam()
          }}
        />
      )}
    </div>
  )
}

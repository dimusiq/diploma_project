import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { FaPlus } from "react-icons/fa"
import { FiChevronDown, FiChevronUp, FiSearch } from "react-icons/fi"
import {
  EQUIPMENT_TYPE_LABELS,
  type EquipmentPublic,
  type EquipmentSortField,
  type EquipmentSortOrder,
  equipmentApi,
} from "@/api/equipment.ts"
import { zonesApi } from "@/api/zones.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { EquipmentImportDialog } from "@/components/Equipment/EquipmentImportDialog.tsx"
import { MassAssignZoneDialog } from "@/components/Equipment/MassAssignZoneDialog.tsx"
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
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { cn } from "@/lib/utils.ts"
import { handleError } from "@/utils.ts"

const STATUS_LABELS: Record<string, string> = {
  active: "В эксплуатации",
  maintenance: "На обслуживании",
  decommissioned: "Выведена из эксплуатации",
}

const PAGE_SIZE = 500
/** Строк таблицы на одной странице (клиентская пагинация отфильтрованного списка). */
const PER_PAGE = 20

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string
  sortKey: EquipmentSortField
  currentSort: EquipmentSortField | undefined
  currentOrder: EquipmentSortOrder
  onSort: (key: EquipmentSortField) => void
}) {
  const isActive = currentSort === sortKey
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap hover:bg-muted/50"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === "asc" ? (
            <FiChevronUp className="size-4" aria-hidden />
          ) : (
            <FiChevronDown className="size-4" aria-hidden />
          )
        ) : (
          <FiChevronUp className="size-4 opacity-30" aria-hidden />
        )}
      </span>
    </TableHead>
  )
}

async function fetchAllEquipment(params: {
  search?: string
  current_status?: string
  equipment_type?: string
  sort_by?: EquipmentSortField
  order?: EquipmentSortOrder
}) {
  const all: EquipmentPublic[] = []
  let skip = 0
  let expectedCount: number | null = null

  // Грузим порциями, пока не соберём всё (или пока бэк не начнёт возвращать пустые страницы).
  // Это убирает зависимость от пагинации на UI и гарантирует полный список.
  for (let guard = 0; guard < 1000; guard++) {
    const res = await equipmentApi.list({
      skip,
      limit: PAGE_SIZE,
      ...params,
    })
    expectedCount ??= res.count ?? 0

    if (!res.data?.length) break
    all.push(...res.data)

    // Если бэк уже отдал все записи — выходим.
    if (all.length >= expectedCount) break

    // Если бэк вернул меньше лимита — дальше страниц скорее всего нет.
    if (res.data.length < PAGE_SIZE) break

    skip += PAGE_SIZE
  }

  return { data: all, count: expectedCount ?? all.length }
}

export function EquipmentList() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<EquipmentSortField | undefined>(
    undefined,
  )
  const [sortOrder, setSortOrder] = useState<EquipmentSortOrder>("asc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<EquipmentPublic | null>(
    null,
  )
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { showErrorToast } = useCustomToast()

  const handleSort = (key: EquipmentSortField) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(key)
      setSortOrder("asc")
    }
  }

  const { data: zones = [] } = useQuery({
    queryKey: ["zones"],
    queryFn: () => zonesApi.list(),
  })

  const { data, isLoading, isFetching } = useQuery({
    // Загружаем весь список один раз, а фильтры/поиск/сортировка делаем локально,
    // чтобы UI не прыгал при каждом изменении фильтра (как в «Графике ТО»).
    queryKey: ["equipment", "all"],
    queryFn: () => fetchAllEquipment({}),
    // Чтобы при изменении фильтров/поиска не моргала таблица: держим предыдущие данные,
    // пока загружаются новые.
    placeholderData: (prev) => prev,
  })

  const allItems = data?.data ?? []
  const totalCount = data?.count ?? allItems.length

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = allItems

    if (q) {
      list = list.filter((i) => {
        const hay = [
          i.serial_number,
          i.garage_number,
          i.vin,
          i.brand_name,
          i.model,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }

    if (statusFilter) {
      list = list.filter((i) => i.current_status === statusFilter)
    }

    if (typeFilter) {
      list = list.filter((i) => i.equipment_type === typeFilter)
    }

    if (!sortBy) return list

    const mult = sortOrder === "asc" ? 1 : -1
    const arr = [...list]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case "brand_model": {
          const sa = `${a.brand_name ?? ""} ${a.model ?? ""}`.trim()
          const sb = `${b.brand_name ?? ""} ${b.model ?? ""}`.trim()
          cmp = sa.localeCompare(sb)
          break
        }
        case "serial_number":
          cmp = (a.serial_number ?? "").localeCompare(b.serial_number ?? "")
          break
        case "garage_number":
          cmp = (a.garage_number ?? "").localeCompare(b.garage_number ?? "")
          break
        case "equipment_type":
          cmp = (a.equipment_type ?? "").localeCompare(b.equipment_type ?? "")
          break
        case "zone":
          cmp = (a.zone ?? "").localeCompare(b.zone ?? "")
          break
        case "commissioned_at": {
          const da = a.commissioned_at ? Date.parse(a.commissioned_at) : NaN
          const db = b.commissioned_at ? Date.parse(b.commissioned_at) : NaN
          const va = Number.isFinite(da) ? da : sortOrder === "asc" ? 1e18 : -1
          const vb = Number.isFinite(db) ? db : sortOrder === "asc" ? 1e18 : -1
          cmp = va - vb
          break
        }
        case "engine_hours": {
          const nullVal = sortOrder === "asc" ? 1e18 : -1
          const va = a.engine_hours ?? nullVal
          const vb = b.engine_hours ?? nullVal
          cmp = va - vb
          break
        }
        case "current_status":
          cmp = (a.current_status ?? "").localeCompare(b.current_status ?? "")
          break
      }
      return mult * cmp
    })
    return arr
  }, [allItems, search, statusFilter, typeFilter, sortBy, sortOrder])

  const filteredCount = items.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / PER_PAGE))

  const listViewKey = `${search}|${statusFilter}|${typeFilter}|${sortBy ?? ""}|${sortOrder}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: сброс страницы при смене фильтров/сортировки
  useEffect(() => {
    setPage(1)
  }, [listViewKey])

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * PER_PAGE
    return items.slice(start, start + PER_PAGE)
  }, [items, page])

  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = (page - 1) * PER_PAGE + pageItems.length

  const handleEdit = (item: EquipmentPublic) => {
    navigate({
      to: "/technique/equipment/$equipmentId",
      params: { equipmentId: item.id },
    })
  }

  const handleDeleteClick = (item: EquipmentPublic) => {
    setDeleteConfirm(item)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await equipmentApi.delete(deleteConfirm.id)
      setDeleteConfirm(null)
      queryClient.invalidateQueries({
        queryKey: ["equipment"],
      })
    } catch (err) {
      if (err instanceof Error) {
        showErrorToast(err.message)
      } else {
        handleError(err as Parameters<typeof handleError>[0])
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleAdd = () => {
    navigate({ to: "/technique/equipment/new" })
  }

  const toggleAll = () => {
    const ids = pageItems.map((i) => i.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const id of ids) next.delete(id)
      } else {
        for (const id of ids) next.add(id)
      }
      return next
    })
  }

  const isAllSelected =
    pageItems.length > 0 && pageItems.every((i) => selectedIds.has(i.id))
  const isSomeSelected = pageItems.some((i) => selectedIds.has(i.id))

  return (
    <div>
      <div
        className={cn(
          "mb-4 flex min-h-[52px] flex-wrap items-center gap-3 rounded-md bg-muted/50 p-3",
          selectedIds.size === 0 && "invisible pointer-events-none",
        )}
      >
        <p className="text-sm font-medium">Выбрано: {selectedIds.size}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setZoneDialogOpen(true)}
        >
          Назначить зону
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedIds(new Set())}
        >
          Снять выделение
        </Button>
      </div>
      <div className="mb-4 flex flex-col flex-wrap gap-4 md:flex-row">
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <Input
            placeholder="Поиск (серийный номер, бренд, модель)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-[40ch]"
          />
          <span className="text-muted-foreground">
            <FiSearch />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={toSelectAll(typeFilter)}
            onValueChange={(v) => setTypeFilter(fromSelectAll(v))}
          >
            <SelectTrigger className="h-8 min-w-[10rem] text-sm">
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL_VALUE}>Все типы</SelectItem>
              {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={toSelectAll(statusFilter)}
            onValueChange={(v) => setStatusFilter(fromSelectAll(v))}
          >
            <SelectTrigger className="h-8 min-w-[12rem] text-sm">
              <SelectValue placeholder="Состояние" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL_VALUE}>Все состояния</SelectItem>
              <SelectItem value="active">В эксплуатации</SelectItem>
              <SelectItem value="maintenance">На обслуживании</SelectItem>
              <SelectItem value="decommissioned">
                Выведена из эксплуатации
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            Импорт Excel
          </Button>
          <Button variant="outlineSky" size="sm" onClick={handleAdd}>
            <FaPlus />
            Добавить
          </Button>
        </div>
      </div>

      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <FaPlus className="size-6" />
          </div>
          <p className="font-heading font-semibold">Нет техники</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Складская техника: бренды задаются в разделе «Администрирование» →
            Бренды.
          </p>
          <Button variant="outlineSky" size="sm" onClick={handleAdd}>
            Добавить технику
          </Button>
        </div>
      ) : filteredCount === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Нет записей по текущим фильтрам и поиску.
        </p>
      ) : (
        <div>
          <FetchingIndicator active={isFetching && !!data} mb={2} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="w-8 min-w-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={
                      isAllSelected
                        ? true
                        : isSomeSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Выбрать все на странице"
                  />
                </TableHead>
                <SortableHeader
                  label="Модель"
                  sortKey="brand_model"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Серийный номер"
                  sortKey="serial_number"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Гаражный номер"
                  sortKey="garage_number"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Тип"
                  sortKey="equipment_type"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Зона склада"
                  sortKey="zone"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Дата ввода"
                  sortKey="commissioned_at"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Моточасы"
                  sortKey="engine_hours"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Состояние"
                  sortKey="current_status"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHead className="text-end">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted/80"
                  onClick={() => handleEdit(item)}
                >
                  <TableCell
                    className="w-8 min-w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }}
                      aria-label={`Выбрать ${item.brand_name} ${item.model}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {item.brand_name} {item.model}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Ввод в эксплуатацию:{" "}
                        {item.commissioned_at
                          ? new Date(item.commissioned_at).toLocaleDateString(
                              "ru-RU",
                            )
                          : "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{item.serial_number || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{item.garage_number || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {EQUIPMENT_TYPE_LABELS[item.equipment_type] ??
                        item.equipment_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {zones.some((z) => z.name === item.zone)
                        ? item.zone
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {item.commissioned_at
                        ? new Date(item.commissioned_at).toLocaleDateString(
                            "ru-RU",
                          )
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {item.engine_hours != null ? item.engine_hours : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {STATUS_LABELS[item.current_status] ??
                        item.current_status}
                    </span>
                  </TableCell>
                  <TableCell
                    className="text-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="xs" variant="ghost" aria-label="Действия">
                          ⋮
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          variant="outlineDestructive"
                          onSelect={() => handleDeleteClick(item)}
                        >
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {totalCount > 0 && filteredCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {`Строки ${rangeStart}–${rangeEnd} из ${filteredCount}${
              filteredCount !== totalCount
                ? ` (всего в системе: ${totalCount})`
                : ""
            }`}
          </p>
          {totalPages > 1 ? (
            <div className="flex shrink-0 justify-end">
              <PaginationRoot
                count={filteredCount}
                pageSize={PER_PAGE}
                page={page}
                onPageChange={(e) => setPage(e.page)}
              >
                <div className="flex">
                  <PaginationPrevTrigger />
                  <PaginationItems />
                  <PaginationNextTrigger />
                </div>
              </PaginationRoot>
            </div>
          ) : null}
        </div>
      )}
      <EquipmentImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <MassAssignZoneDialog
        open={zoneDialogOpen}
        onOpenChange={setZoneDialogOpen}
        selectedIds={Array.from(selectedIds)}
        onSuccess={() => setSelectedIds(new Set())}
      />
      <ConfirmDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Удалить технику?"
        description={
          deleteConfirm
            ? `Удалить «${deleteConfirm.brand_name} ${deleteConfirm.model}»? Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}

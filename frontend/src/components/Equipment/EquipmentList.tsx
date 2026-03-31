import {
  Box,
  Button,
  EmptyState,
  Flex,
  Input,
  Table,
  Text,
} from "@chakra-ui/react"
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
    <Table.ColumnHeader
      cursor="pointer"
      userSelect="none"
      onClick={() => onSort(sortKey)}
      _hover={{ bg: "gray.subtle" }}
      whiteSpace="nowrap"
    >
      <Flex align="center" gap={1}>
        <Text>{label}</Text>
        {isActive ? (
          currentOrder === "asc" ? (
            <Box as={FiChevronUp} boxSize={4} aria-hidden />
          ) : (
            <Box as={FiChevronDown} boxSize={4} aria-hidden />
          )
        ) : (
          <Box as={FiChevronUp} boxSize={4} opacity={0.3} aria-hidden />
        )}
      </Flex>
    </Table.ColumnHeader>
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
    const res = await equipmentApi.list({ skip, limit: PAGE_SIZE, ...params })
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
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
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
    <Box>
      <Flex
        gap={3}
        mb={4}
        p={3}
        bg="bg.subtle"
        borderRadius="md"
        align="center"
        flexWrap="wrap"
        minH="52px"
        visibility={selectedIds.size > 0 ? "visible" : "hidden"}
        pointerEvents={selectedIds.size > 0 ? "auto" : "none"}
      >
        <Text fontSize="sm" fontWeight="medium">
          Выбрано: {selectedIds.size}
        </Text>
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
      </Flex>
      <Flex
        direction={{ base: "column", md: "row" }}
        gap={4}
        mb={4}
        wrap="wrap"
      >
        <Flex gap={2} align="center" flex="1" minW="200px">
          <Input
            placeholder="Поиск (серийный номер, бренд, модель)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="sm"
            maxW="40ch"
          />
          <Box color="fg.muted">
            <FiSearch />
          </Box>
        </Flex>
        <Flex gap={2} align="center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
              fontSize: "14px",
            }}
          >
            <option value="">Все типы</option>
            {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
              fontSize: "14px",
            }}
          >
            <option value="">Все состояния</option>
            <option value="active">В эксплуатации</option>
            <option value="maintenance">На обслуживании</option>
            <option value="decommissioned">Выведена из эксплуатации</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            Импорт Excel
          </Button>
          <Button variant="solid" size="sm" onClick={handleAdd}>
            <FaPlus />
            Добавить
          </Button>
        </Flex>
      </Flex>

      {isLoading && !data ? (
        <Text color="fg.muted">Загрузка...</Text>
      ) : allItems.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <FaPlus />
            </EmptyState.Indicator>
            <EmptyState.Title>Нет техники</EmptyState.Title>
            <EmptyState.Description>
              Складская техника: бренды задаются в разделе «Администрирование» →
              Бренды.
            </EmptyState.Description>
            <Button variant="solid" size="sm" onClick={handleAdd}>
              Добавить технику
            </Button>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : filteredCount === 0 ? (
        <Text color="fg.muted" py={8}>
          Нет записей по текущим фильтрам и поиску.
        </Text>
      ) : (
        <Box>
          <FetchingIndicator active={isFetching && !!data} mb={2} />
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader
                  w="8"
                  minW="8"
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
                </Table.ColumnHeader>
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
                <Table.ColumnHeader textAlign="end">
                  Действия
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {pageItems.map((item) => (
                <Table.Row
                  key={item.id}
                  cursor="pointer"
                  transition="background 0.15s ease"
                  _hover={{ bg: "gray.subtle" }}
                  _active={{ bg: "gray.muted" }}
                  onClick={() => handleEdit(item)}
                >
                  <Table.Cell
                    w="8"
                    minW="8"
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
                  </Table.Cell>
                  <Table.Cell>
                    <Flex direction="column" gap={0.5}>
                      <Text fontWeight="medium">
                        {item.brand_name} {item.model}
                      </Text>
                      <Text fontSize="xs" color="fg.muted">
                        Ввод в эксплуатацию:{" "}
                        {item.commissioned_at
                          ? new Date(item.commissioned_at).toLocaleDateString(
                              "ru-RU",
                            )
                          : "—"}
                      </Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">{item.serial_number || "—"}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">{item.garage_number || "—"}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">
                      {EQUIPMENT_TYPE_LABELS[item.equipment_type] ??
                        item.equipment_type}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">
                      {zones.some((z) => z.name === item.zone)
                        ? item.zone
                        : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">
                      {item.commissioned_at
                        ? new Date(item.commissioned_at).toLocaleDateString(
                            "ru-RU",
                          )
                        : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">
                      {item.engine_hours != null ? item.engine_hours : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="sm">
                      {STATUS_LABELS[item.current_status] ??
                        item.current_status}
                    </Text>
                  </Table.Cell>
                  <Table.Cell
                    textAlign="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MenuRoot>
                      <MenuTrigger asChild>
                        <Button size="xs" variant="ghost" aria-label="Действия">
                          ⋮
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem
                          value="delete"
                          onClick={() => handleDeleteClick(item)}
                          color="red"
                        >
                          Удалить
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
      {totalCount > 0 && filteredCount > 0 && (
        <Flex
          mt={4}
          align="center"
          justify="space-between"
          flexWrap="wrap"
          gap={3}
        >
          <Text fontSize="sm" color="fg.muted">
            {`Строки ${rangeStart}–${rangeEnd} из ${filteredCount}${
              filteredCount !== totalCount
                ? ` (всего в системе: ${totalCount})`
                : ""
            }`}
          </Text>
          {totalPages > 1 ? (
            <Flex justifyContent="flex-end" flexShrink={0}>
              <PaginationRoot
                count={filteredCount}
                pageSize={PER_PAGE}
                page={page}
                onPageChange={(e) => setPage(e.page)}
              >
                <Flex>
                  <PaginationPrevTrigger />
                  <PaginationItems />
                  <PaginationNextTrigger />
                </Flex>
              </PaginationRoot>
            </Flex>
          ) : null}
        </Flex>
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
    </Box>
  )
}

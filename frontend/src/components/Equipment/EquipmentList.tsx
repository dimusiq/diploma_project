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
import { useState } from "react"
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
import { MassAssignZoneDialog } from "@/components/Equipment/MassAssignZoneDialog.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { handleError } from "@/utils.ts"

const STATUS_LABELS: Record<string, string> = {
  active: "В эксплуатации",
  maintenance: "На обслуживании",
  decommissioned: "Выведена из эксплуатации",
}

const PER_PAGE = 10

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

export function EquipmentList() {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<EquipmentSortField | undefined>(undefined)
  const [sortOrder, setSortOrder] = useState<EquipmentSortOrder>("asc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<EquipmentPublic | null>(
    null,
  )
  const [isDeleting, setIsDeleting] = useState(false)
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
    setPage(0)
  }

  const { data: zones = [] } = useQuery({
    queryKey: ["zones"],
    queryFn: () => zonesApi.list(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["equipment", page, search, statusFilter, typeFilter, sortBy, sortOrder],
    queryFn: () =>
      equipmentApi.list({
        skip: page * PER_PAGE,
        limit: PER_PAGE,
        search: search || undefined,
        current_status: statusFilter || undefined,
        equipment_type: typeFilter || undefined,
        sort_by: sortBy,
        order: sortOrder,
      }),
  })

  const items = data?.data ?? []
  const count = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(count / PER_PAGE))

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
    const ids = items.map((i) => i.id)
    const allSelected = ids.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(ids))
  }

  const isAllSelected =
    items.length > 0 && items.every((i) => selectedIds.has(i.id))
  const isSomeSelected = items.some((i) => selectedIds.has(i.id))

  return (
    <Box>
      {selectedIds.size > 0 && (
        <Flex
          gap={3}
          mb={4}
          p={3}
          bg="bg.subtle"
          borderRadius="md"
          align="center"
          flexWrap="wrap"
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
      )}
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
          <Button size="sm" onClick={handleAdd}>
            <FaPlus />
            Добавить
          </Button>
        </Flex>
      </Flex>

      {isLoading ? (
        <Text color="fg.muted">Загрузка...</Text>
      ) : items.length === 0 ? (
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
            <Button onClick={handleAdd}>Добавить технику</Button>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader w="8" minW="8" onClick={(e) => e.stopPropagation()}>
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
              <Table.ColumnHeader textAlign="end">Действия</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row
                key={item.id}
                cursor="pointer"
                transition="background 0.15s ease"
                _hover={{ bg: "gray.subtle" }}
                _active={{ bg: "gray.muted" }}
                onClick={() => handleEdit(item)}
              >
                <Table.Cell w="8" minW="8" onClick={(e) => e.stopPropagation()}>
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
                    {zones.some((z) => z.name === item.zone) ? item.zone : "—"}
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
                    {STATUS_LABELS[item.current_status] ?? item.current_status}
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
      )}

      {totalPages > 1 && (
        <Flex justify="space-between" align="center" mt={4}>
          <Text fontSize="sm" color="fg.muted">
            Показано {items.length} из {count}
          </Text>
          <Flex gap={2}>
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Назад
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд
            </Button>
          </Flex>
        </Flex>
      )}
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

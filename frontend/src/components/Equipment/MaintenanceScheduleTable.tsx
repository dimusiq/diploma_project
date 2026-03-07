/**
 * График ТО — таблица с производными данными по моточасам.
 * Типичный UI: таблица, статусы с цветовой индикацией, фильтры, сводка.
 */
import {
  Badge,
  Box,
  Button,
  Flex,
  Input,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { FiChevronDown, FiChevronUp, FiDownload } from "react-icons/fi"

import type { MaintenanceRecordCreate } from "@/api/equipment"
import useCustomToast from "@/hooks/useCustomToast"

import {
  EQUIPMENT_TYPE_LABELS,
  type EquipmentPublic,
  equipmentApi,
} from "@/api/equipment.ts"
import {
  apiChainToLegacyFormat,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import {
  downloadMaintenanceScheduleCsv,
  downloadMaintenanceScheduleXlsx,
} from "@/api/exportMaintenanceSchedule.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu.tsx"
import { getRemindBeforeHoursForEquipment } from "@/utils/maintenanceChains.ts"

type ScheduleStatus = "overdue" | "due_soon" | "ok"

function getNextServiceAtHours(
  engineHours: number | null,
  intervalHours: number,
): number | null {
  if (engineHours == null) return null
  return Math.ceil(engineHours / intervalHours) * intervalHours
}

/** Предыдущее ТО — последняя отметка по интервалу (м/ч), на которой проводилось ТО */
function getLastMaintenanceAtHours(
  engineHours: number | null,
  intervalHours: number,
): number | null {
  if (engineHours == null) return null
  const last = Math.floor(engineHours / intervalHours) * intervalHours
  return last > 0 ? last : null
}

/** Статус по моточасам: «Скоро» — если до ТО осталось не более remindBeforeHours (настраивается в Расписании ТО). */
function getScheduleStatus(
  engineHours: number | null,
  nextAt: number | null,
  remindBeforeHours: number,
): ScheduleStatus {
  if (engineHours == null || nextAt == null) return "ok"
  if (engineHours >= nextAt) return "overdue"
  const remaining = nextAt - engineHours
  if (remaining <= remindBeforeHours) return "due_soon"
  return "ok"
}

interface RowData {
  equipment: EquipmentPublic
  engineHours: number | null
  lastMaintenanceAtHours: number | null
  nextServiceAtHours: number | null
  status: ScheduleStatus
  /** Имя первой (для сортировки) последовательности ТО, в которой есть эта техника */
  primaryChainName: string
}

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  overdue: "Просрочено",
  due_soon: "Скоро",
  ok: "Норма",
}

const STATUS_COLOR: Record<ScheduleStatus, string> = {
  overdue: "red",
  due_soon: "yellow",
  ok: "green",
}

type ScheduleSortField =
  | "equipment"
  | "serial_number"
  | "garage_number"
  | "primaryChainName"
  | "lastMaintenanceAtHours"
  | "engineHours"
  | "nextServiceAtHours"
  | "remaining"
  | "status"
type ScheduleSortOrder = "asc" | "desc"

const STATUS_ORDER: Record<ScheduleStatus, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
}

function getRemaining(r: RowData): number | null {
  const { engineHours, nextServiceAtHours, status } = r
  if (
    engineHours != null &&
    nextServiceAtHours != null &&
    engineHours < nextServiceAtHours
  )
    return nextServiceAtHours - engineHours
  return status === "overdue" ? 0 : null
}

function ScheduleSortableHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string
  sortKey: ScheduleSortField
  currentSort: ScheduleSortField | undefined
  currentOrder: ScheduleSortOrder
  onSort: (key: ScheduleSortField) => void
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

function EquipmentMaintenanceRecordsList({
  equipmentId,
  onOpenCard,
}: {
  equipmentId: string
  onOpenCard: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["equipment-maintenance-records", equipmentId],
    queryFn: () => equipmentApi.maintenanceRecords(equipmentId),
  })
  const records = data?.data ?? []

  return (
    <Box>
      <Flex justify="flex-end" mb={3}>
        <Button size="sm" variant="outline" onClick={onOpenCard}>
          Перейти в карточку техники
        </Button>
      </Flex>
      {isLoading && <Text color="fg.muted">Загрузка…</Text>}
      {!isLoading && records.length === 0 && (
        <Text color="fg.muted">
          Проведённых ТО по этой единице техники пока нет.
        </Text>
      )}
      {!isLoading && records.length > 0 && (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Дата</Table.ColumnHeader>
              <Table.ColumnHeader>Интервал (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Моточасы на момент ТО</Table.ColumnHeader>
              <Table.ColumnHeader>Комментарий</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {records.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  {new Date(r.performed_at).toLocaleDateString("ru-RU")}
                </Table.Cell>
                <Table.Cell>{r.interval_hours}</Table.Cell>
                <Table.Cell>
                  {r.engine_hours_at_service != null
                    ? r.engine_hours_at_service
                    : "—"}
                </Table.Cell>
                <Table.Cell>{r.comment ?? "—"}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  )
}

/** Диалог «Записать проведённое ТО» для одной выбранной техники (из графика ТО). */
function RecordMaintenanceDialog({
  equipment,
  open,
  onOpenChange,
  onSuccess,
}: {
  equipment: EquipmentPublic | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const toast = useCustomToast()
  const [performedAt, setPerformedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [intervalHours, setIntervalHours] = useState(500)
  const [engineHoursAtService, setEngineHoursAtService] = useState("")
  const [comment, setComment] = useState("")

  const createMutation = useMutation({
    mutationFn: (body: MaintenanceRecordCreate) =>
      equipment
        ? equipmentApi.createMaintenanceRecord(equipment.id, body)
        : Promise.reject(new Error("Техника не выбрана")),
    onSuccess: () => {
      toast.showSuccessToast("Проведённое ТО записано")
      onSuccess()
      onOpenChange(false)
      setEngineHoursAtService("")
      setComment("")
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error ? err.message : "Что-то пошло не так.",
      )
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipment) return
    createMutation.mutate({
      performed_at: performedAt,
      interval_hours: intervalHours,
      engine_hours_at_service: engineHoursAtService.trim()
        ? parseInt(engineHoursAtService, 10)
        : undefined,
      comment: comment.trim() || undefined,
    })
  }

  if (!equipment) return null

  return (
    <DialogRoot open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              Записать проведённое ТО — {equipment.brand_name} {equipment.model}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={3} align="stretch">
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Дата проведения ТО
                </Text>
                <Input
                  type="date"
                  value={performedAt}
                  onChange={(e) => setPerformedAt(e.target.value)}
                  required
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Интервал ТО (м/ч)
                </Text>
                <Input
                  type="number"
                  min={1}
                  value={intervalHours}
                  onChange={(e) =>
                    setIntervalHours(parseInt(e.target.value, 10) || 500)
                  }
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Моточасы на момент ТО (необязательно)
                </Text>
                <Input
                  type="number"
                  min={0}
                  value={engineHoursAtService}
                  onChange={(e) => setEngineHoursAtService(e.target.value)}
                  placeholder="—"
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Комментарий (необязательно)
                </Text>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="—"
                  size="sm"
                  rows={2}
                />
              </Box>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button variant="solid" size="sm" type="submit" loading={createMutation.isPending}>
              Записать
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

const FILTERS_STORAGE_KEY = "maintenance_schedule_filters"

function loadFilters(): {
  statusFilter: ScheduleStatus | ""
  typeFilter: string
  chainFilter: string
  sortByChain: boolean
} {
  if (typeof window === "undefined")
    return {
      statusFilter: "",
      typeFilter: "",
      chainFilter: "",
      sortByChain: false,
    }
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY)
    if (!raw)
      return {
        statusFilter: "",
        typeFilter: "",
        chainFilter: "",
        sortByChain: false,
      }
    const o = JSON.parse(raw) as Record<string, unknown>
    return {
      statusFilter: (o.statusFilter === "overdue" ||
      o.statusFilter === "due_soon" ||
      o.statusFilter === "ok"
        ? o.statusFilter
        : "") as ScheduleStatus | "",
      typeFilter: typeof o.typeFilter === "string" ? o.typeFilter : "",
      chainFilter: typeof o.chainFilter === "string" ? o.chainFilter : "",
      sortByChain: o.sortByChain === true,
    }
  } catch {
    return {
      statusFilter: "",
      typeFilter: "",
      chainFilter: "",
      sortByChain: false,
    }
  }
}

function saveFilters(f: {
  statusFilter: ScheduleStatus | ""
  typeFilter: string
  chainFilter: string
  sortByChain: boolean
}) {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f))
  } catch {
    /**/
  }
}

export function MaintenanceScheduleTable() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useCustomToast()
  const [statusFilter, setStatusFilter] = useState<ScheduleStatus | "">(
    () => loadFilters().statusFilter,
  )
  const [typeFilter, setTypeFilter] = useState<string>(
    () => loadFilters().typeFilter,
  )
  const [chainFilter, setChainFilter] = useState<string>(
    () => loadFilters().chainFilter,
  )
  const [sortByChain, setSortByChain] = useState<boolean>(
    () => loadFilters().sortByChain,
  )
  const [isExporting, setIsExporting] = useState(false)
  const [selectedEquipment, setSelectedEquipment] =
    useState<EquipmentPublic | null>(null)
  const [equipmentForRecord, setEquipmentForRecord] =
    useState<EquipmentPublic | null>(null)
  const [scheduleSortBy, setScheduleSortBy] = useState<
    ScheduleSortField | undefined
  >(undefined)
  const [scheduleSortOrder, setScheduleSortOrder] =
    useState<ScheduleSortOrder>("asc")

  const handleScheduleSort = (key: ScheduleSortField) => {
    if (scheduleSortBy === key) {
      setScheduleSortOrder((o) => (o === "asc" ? "desc" : "asc"))
    } else {
      setScheduleSortBy(key)
      setScheduleSortOrder("asc")
    }
  }

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      current_status,
    }: {
      id: string
      current_status: string
    }) => equipmentApi.update(id, { current_status }),
    onSuccess: () => {
      toast.showSuccessToast("Техника переведена на обслуживание")
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error ? err.message : "Что-то пошло не так.",
      )
    },
  })

  const refreshMaintenanceData = () => {
    queryClient.invalidateQueries({ queryKey: ["equipment"] })
    queryClient.invalidateQueries({
      queryKey: ["equipment", "all-maintenance-records"],
    })
    queryClient.invalidateQueries({
      queryKey: ["equipment-maintenance-records"],
    })
  }

  const { data: chainsData } = useQuery({
    queryKey: ["maintenance-chains"],
    queryFn: () => maintenanceScheduleApi.listChains(),
  })
  const { data: configData } = useQuery({
    queryKey: ["maintenance-schedule-config"],
    queryFn: () => maintenanceScheduleApi.getConfig(),
  })

  const chains = useMemo(
    () => (chainsData?.data ?? []).map(apiChainToLegacyFormat),
    [chainsData?.data],
  )
  const intervalHours =
    (configData?.default_intervals ?? [500])[0] ?? 500
  const defaultRemindBefore =
    configData?.default_remind_before_hours ?? 50

  useEffect(() => {
    saveFilters({ statusFilter, typeFilter, chainFilter, sortByChain })
  }, [statusFilter, typeFilter, chainFilter, sortByChain])

  const { data, isLoading } = useQuery({
    queryKey: ["equipment", "schedule"],
    queryFn: () => equipmentApi.list({ limit: 500, skip: 0 }),
  })

  const rows: RowData[] = useMemo(() => {
    const list = data?.data ?? []
    return list.map((equipment) => {
      const engineHours = equipment.engine_hours ?? null
      const lastAt = getLastMaintenanceAtHours(engineHours, intervalHours)
      const nextAt = getNextServiceAtHours(engineHours, intervalHours)
      const remindBefore = getRemindBeforeHoursForEquipment(
        equipment.id,
        defaultRemindBefore,
        chains,
      )
      const status = getScheduleStatus(engineHours, nextAt, remindBefore)
      const chainNames = chains
        .filter((c) => c.equipmentIds.includes(equipment.id))
        .map((c) => c.name)
        .sort()
      const primaryChainName = chainNames[0] ?? ""
      return {
        equipment,
        engineHours,
        lastMaintenanceAtHours: lastAt,
        nextServiceAtHours: nextAt,
        status,
        primaryChainName,
      }
    })
  }, [data?.data, intervalHours, defaultRemindBefore, chains])

  const filteredRows = useMemo(() => {
    let list = rows
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter)
    }
    if (typeFilter) {
      list = list.filter((r) => r.equipment.equipment_type === typeFilter)
    }
    if (chainFilter) {
      const chain = chains.find((c) => c.id === chainFilter)
      if (chain) {
        const idSet = new Set(chain.equipmentIds)
        list = list.filter((r) => idSet.has(r.equipment.id))
      }
    }
    const arr = [...list]

    if (scheduleSortBy != null) {
      const mult = scheduleSortOrder === "asc" ? 1 : -1
      arr.sort((a, b) => {
        let cmp = 0
        switch (scheduleSortBy) {
          case "equipment": {
            const sa = `${a.equipment.brand_name ?? ""} ${a.equipment.model ?? ""}`.trim()
            const sb = `${b.equipment.brand_name ?? ""} ${b.equipment.model ?? ""}`.trim()
            cmp = sa.localeCompare(sb)
            break
          }
          case "serial_number": {
            const sa = a.equipment.serial_number ?? ""
            const sb = b.equipment.serial_number ?? ""
            cmp = sa.localeCompare(sb)
            break
          }
          case "garage_number": {
            const sa = a.equipment.garage_number ?? ""
            const sb = b.equipment.garage_number ?? ""
            cmp = sa.localeCompare(sb)
            break
          }
          case "primaryChainName":
            cmp = a.primaryChainName.localeCompare(b.primaryChainName)
            break
          case "lastMaintenanceAtHours": {
            const nullVal = scheduleSortOrder === "asc" ? 1e9 : -1
            const va = a.lastMaintenanceAtHours ?? nullVal
            const vb = b.lastMaintenanceAtHours ?? nullVal
            cmp = va - vb
            break
          }
          case "engineHours": {
            const nullVal = scheduleSortOrder === "asc" ? 1e9 : -1
            const va = a.engineHours ?? nullVal
            const vb = b.engineHours ?? nullVal
            cmp = va - vb
            break
          }
          case "nextServiceAtHours": {
            const nullVal = scheduleSortOrder === "asc" ? 1e9 : -1
            const va = a.nextServiceAtHours ?? nullVal
            const vb = b.nextServiceAtHours ?? nullVal
            cmp = va - vb
            break
          }
          case "remaining": {
            const nullVal = scheduleSortOrder === "asc" ? 1e9 : -1
            const va = getRemaining(a) ?? nullVal
            const vb = getRemaining(b) ?? nullVal
            cmp = va - vb
            break
          }
          case "status":
            cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
            break
        }
        return mult * cmp
      })
      return arr
    }

    return arr.sort((a, b) => {
      if (sortByChain) {
        if (a.primaryChainName !== b.primaryChainName) {
          return a.primaryChainName.localeCompare(b.primaryChainName)
        }
      }
      if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status])
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      const nextA = a.nextServiceAtHours ?? 1e9
      const nextB = b.nextServiceAtHours ?? 1e9
      return nextA - nextB
    })
  }, [
    rows,
    statusFilter,
    typeFilter,
    chainFilter,
    sortByChain,
    chains,
    scheduleSortBy,
    scheduleSortOrder,
  ])

  const summary = useMemo(() => {
    const overdue = rows.filter((r) => r.status === "overdue").length
    const dueSoon = rows.filter((r) => r.status === "due_soon").length
    return { overdue, dueSoon }
  }, [rows])

  const handleExport = async (format: "csv" | "xlsx") => {
    setIsExporting(true)
    try {
      if (format === "csv") {
        downloadMaintenanceScheduleCsv(filteredRows)
      } else {
        await downloadMaintenanceScheduleXlsx(filteredRows)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) {
    return <Text color="fg.muted">Загрузка...</Text>
  }

  return (
    <Box>
      <Flex gap={3} mb={4} flexWrap="wrap" align="center">
        <Link to="/technique" search={{ section: "maintenance-schedule" }}>
          <Button size="sm" variant="outline">
            Перейти к расписанию ТО
          </Button>
        </Link>
      </Flex>
      <Flex gap={4} mb={4} flexWrap="wrap" align="center">
        <Flex gap={2} flexWrap="wrap">
          <Badge colorPalette="red" px={2} py={1}>
            Просрочено: {summary.overdue}
          </Badge>
          <Badge colorPalette="yellow" px={2} py={1}>
            Скоро: {summary.dueSoon}
          </Badge>
        </Flex>
        <MenuRoot>
          <MenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              aria-label="Выгрузить отчёт"
            >
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
        <Flex gap={2} align="center" flex="1" flexWrap="wrap">
          <Text fontSize="sm" color="fg.muted">
            Статус:
          </Text>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter((e.target.value || "") as ScheduleStatus | "")
            }
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
              fontSize: "14px",
            }}
          >
            <option value="">Все</option>
            <option value="overdue">Просрочено</option>
            <option value="due_soon">Скоро</option>
            <option value="ok">Норма</option>
          </select>
          <Text fontSize="sm" color="fg.muted" ml={2}>
            Тип:
          </Text>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: "6px 10px",
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
          <Text fontSize="sm" color="fg.muted" ml={2}>
            Последовательность ТО:
          </Text>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
              fontSize: "14px",
              minWidth: "160px",
            }}
          >
            <option value="">Все</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginLeft: "8px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={sortByChain}
              onChange={(e) => setSortByChain(e.target.checked)}
              aria-label="Сортировать по последовательности ТО"
            />
            <span style={{ color: "var(--chakra-colors-fg-muted)" }}>
              Сортировать по последовательности
            </span>
          </label>
        </Flex>
      </Flex>

      <Text fontSize="sm" color="fg.muted" mb={2}>
        Следующее ТО рассчитывается по моточасам (интервал из «Расписание ТО»:{" "}
        {intervalHours} м/ч). Статус «Скоро» настраивается в последовательности
        ТО (за N м/ч до ТО). Клик по строке — список проведённых ТО по этой
        технике.
      </Text>

      <DialogRoot
        open={selectedEquipment != null}
        onOpenChange={(e) => {
          if (!e.open) setSelectedEquipment(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedEquipment
                ? `${selectedEquipment.brand_name ?? ""} ${selectedEquipment.model ?? ""}`.trim() ||
                  "Техника"
                : "Проведённые ТО"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {selectedEquipment && (
              <EquipmentMaintenanceRecordsList
                equipmentId={selectedEquipment.id}
                onOpenCard={() => {
                  setSelectedEquipment(null)
                  navigate({
                    to: "/technique/equipment/$equipmentId",
                    params: { equipmentId: selectedEquipment.id },
                  })
                }}
              />
            )}
          </DialogBody>
          <DialogCloseTrigger />
        </DialogContent>
      </DialogRoot>

      <RecordMaintenanceDialog
        equipment={equipmentForRecord}
        open={equipmentForRecord != null}
        onOpenChange={(open) => !open && setEquipmentForRecord(null)}
        onSuccess={refreshMaintenanceData}
      />

      {filteredRows.length === 0 ? (
        <Text color="fg.muted">Нет техники по выбранным фильтрам.</Text>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <ScheduleSortableHeader
                label="Техника"
                sortKey="equipment"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Серийный номер"
                sortKey="serial_number"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Гаражный номер"
                sortKey="garage_number"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Последовательность ТО"
                sortKey="primaryChainName"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Предыдущее ТО (м/ч)"
                sortKey="lastMaintenanceAtHours"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Моточасы"
                sortKey="engineHours"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="След. ТО (м/ч)"
                sortKey="nextServiceAtHours"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Осталось м/ч"
                sortKey="remaining"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
              <ScheduleSortableHeader
                label="Статус"
                sortKey="status"
                currentSort={scheduleSortBy}
                currentOrder={scheduleSortOrder}
                onSort={handleScheduleSort}
              />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredRows.map(
              ({
                equipment,
                engineHours,
                lastMaintenanceAtHours,
                nextServiceAtHours,
                status,
                primaryChainName,
              }) => {
                const remaining =
                  engineHours != null &&
                  nextServiceAtHours != null &&
                  engineHours < nextServiceAtHours
                    ? nextServiceAtHours - engineHours
                    : null
                return (
                  <Table.Row
                    key={equipment.id}
                    cursor="pointer"
                    _hover={{ bg: "gray.subtle" }}
                    _active={{ bg: "gray.muted" }}
                    onClick={() => setSelectedEquipment(equipment)}
                  >
                    <Table.Cell>
                      <Text fontWeight="medium">
                        {equipment.brand_name} {equipment.model}
                      </Text>
                      <Text fontSize="xs" color="fg.muted">
                        {EQUIPMENT_TYPE_LABELS[equipment.equipment_type] ??
                          equipment.equipment_type}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {equipment.serial_number || "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {equipment.garage_number || "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Flex direction="column" gap="1" align="flex-start">
                        <Text fontSize="sm">{primaryChainName || "—"}</Text>
                        {primaryChainName && (() => {
                          const chain = chains.find(
                            (c) => c.name === primaryChainName,
                          )
                          const colorTag = chain?.colorTag ?? "gray"
                          return (
                            <Box
                              aria-hidden
                              w="100%"
                              maxW="32px"
                              h="6px"
                              borderRadius="2px"
                              bg={`${colorTag}.400`}
                              flexShrink={0}
                            />
                          )
                        })()}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {lastMaintenanceAtHours != null
                          ? lastMaintenanceAtHours
                          : "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {engineHours != null ? engineHours : "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {nextServiceAtHours != null ? nextServiceAtHours : "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {remaining != null
                          ? remaining
                          : status === "overdue"
                            ? "0"
                            : "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell onClick={(e) => e.stopPropagation()}>
                      <MenuRoot>
                        <MenuTrigger asChild>
                          <Badge
                            size="sm"
                            colorPalette={STATUS_COLOR[status]}
                            cursor="pointer"
                            _hover={{ opacity: 0.9 }}
                            aria-label="Действия по статусу ТО"
                          >
                            {STATUS_LABELS[status]}
                          </Badge>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            value="to-maintenance"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: equipment.id,
                                current_status: "maintenance",
                              })
                            }
                            disabled={updateStatusMutation.isPending}
                          >
                            Перевести на обслуживание
                          </MenuItem>
                          <MenuItem
                            value="record"
                            onClick={() => setEquipmentForRecord(equipment)}
                          >
                            Записать проведённое ТО
                          </MenuItem>
                        </MenuContent>
                      </MenuRoot>
                    </Table.Cell>
                  </Table.Row>
                )
              },
            )}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  )
}

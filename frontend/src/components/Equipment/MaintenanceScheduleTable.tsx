/**
 * График ТО — таблица с производными данными по моточасам.
 * Типичный UI: таблица, статусы с цветовой индикацией, фильтры, сводка.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { FiChevronDown, FiChevronUp, FiDownload } from "react-icons/fi"
import type { MaintenanceRecordCreate } from "@/api/equipment"
import {
  EQUIPMENT_TYPE_LABELS,
  type EquipmentPublic,
  equipmentApi,
} from "@/api/equipment.ts"
import {
  downloadMaintenanceScheduleCsv,
  downloadMaintenanceScheduleXlsx,
} from "@/api/exportMaintenanceSchedule.ts"
import {
  apiChainToLegacyFormat,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
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
  PopoverBody,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverFooter,
  PopoverHeader,
  PopoverRoot,
  PopoverTitle,
} from "@/components/ui/popover.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast"
import { cn } from "@/lib/utils.ts"
import { getRemindBeforeHoursForEquipment } from "@/utils/maintenanceChains.ts"

type ScheduleStatus = "in_repair" | "overdue" | "due_soon" | "ok"

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
): Exclude<ScheduleStatus, "in_repair"> {
  if (engineHours == null || nextAt == null) return "ok"
  if (engineHours >= nextAt) return "overdue"
  const remaining = nextAt - engineHours
  if (remaining <= remindBeforeHours) return "due_soon"
  return "ok"
}

/** Статус строки графика ТО: при «на обслуживании» показываем «В ремонте». */
function resolveRowStatus(
  equipment: EquipmentPublic,
  engineHours: number | null,
  nextAt: number | null,
  remindBeforeHours: number,
): ScheduleStatus {
  if (equipment.current_status === "maintenance") return "in_repair"
  return getScheduleStatus(engineHours, nextAt, remindBeforeHours)
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
  in_repair: "В ремонте",
  overdue: "Просрочено",
  due_soon: "Скоро",
  ok: "Норма",
}

/** Классы для бейджа статуса в строке графика ТО */
const STATUS_BADGE_CLASS: Record<ScheduleStatus, string> = {
  in_repair:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  due_soon:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100",
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100",
}

function chainTagClass(colorTag: string): string {
  const map: Record<string, string> = {
    blue: "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100",
    purple:
      "border-purple-200 bg-purple-100 text-purple-900 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100",
    orange:
      "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100",
    cyan: "border-cyan-200 bg-cyan-100 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100",
    teal: "border-teal-200 bg-teal-100 text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100",
    pink: "border-pink-200 bg-pink-100 text-pink-900 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-100",
    violet:
      "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100",
    indigo:
      "border-indigo-200 bg-indigo-100 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100",
  }
  return map[colorTag] ?? "border-border bg-muted text-foreground"
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
  in_repair: 1,
  due_soon: 2,
  ok: 3,
}

function getRemaining(r: RowData): number | null {
  const { engineHours, nextServiceAtHours, status } = r
  if (
    engineHours != null &&
    nextServiceAtHours != null &&
    engineHours < nextServiceAtHours
  )
    return nextServiceAtHours - engineHours
  if (status === "overdue") return 0
  if (
    status === "in_repair" &&
    engineHours != null &&
    nextServiceAtHours != null &&
    engineHours >= nextServiceAtHours
  )
    return 0
  return null
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
    <TableHead
      className="cursor-pointer whitespace-nowrap select-none hover:bg-muted/60"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive ? (
          currentOrder === "asc" ? (
            <FiChevronUp className="size-4" aria-hidden />
          ) : (
            <FiChevronDown className="size-4" aria-hidden />
          )
        ) : (
          <FiChevronUp className="size-4 opacity-30" aria-hidden />
        )}
      </div>
    </TableHead>
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
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={onOpenCard}>
          Перейти в карточку техники
        </Button>
      </div>
      {isLoading && <p className="text-muted-foreground">Загрузка…</p>}
      {!isLoading && records.length === 0 && (
        <p className="text-muted-foreground">
          Проведённых ТО по этой единице техники пока нет.
        </p>
      )}
      {!isLoading && records.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Интервал (м/ч)</TableHead>
              <TableHead>Моточасы на момент ТО</TableHead>
              <TableHead className="whitespace-normal">Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {new Date(r.performed_at).toLocaleDateString("ru-RU")}
                </TableCell>
                <TableCell>{r.interval_hours}</TableCell>
                <TableCell>
                  {r.engine_hours_at_service != null
                    ? r.engine_hours_at_service
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-normal">{r.comment ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/** Панель «Записать проведённое ТО», привязанная к бейджу статуса в строке графика. */
function RecordMaintenanceDialog({
  equipment,
  anchorEl,
  open,
  onOpenChange,
  onSuccess,
}: {
  equipment: EquipmentPublic | null
  anchorEl: HTMLElement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const toast = useCustomToast()
  const anchorElRef = useRef<HTMLElement | null>(null)
  anchorElRef.current = anchorEl
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
    <PopoverRoot
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      size="lg"
      positioning={{
        getAnchorElement: () => anchorElRef.current,
        placement: "left-start",
        gutter: 8,
        flip: true,
        slide: true,
        fitViewport: true,
      }}
    >
      <PopoverContent maxW="min(92dvw, 26rem)" minW="18rem">
        <form onSubmit={handleSubmit}>
          <PopoverHeader>
            <PopoverTitle>
              Записать проведённое ТО — {equipment.brand_name} {equipment.model}
            </PopoverTitle>
          </PopoverHeader>
          <PopoverBody>
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-sm font-medium">
                  Дата проведения ТО
                </p>
                <Input
                  type="date"
                  value={performedAt}
                  onChange={(e) => setPerformedAt(e.target.value)}
                  required
                  className="h-7"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Интервал ТО (м/ч)
                </p>
                <Input
                  type="number"
                  min={1}
                  value={intervalHours}
                  onChange={(e) =>
                    setIntervalHours(parseInt(e.target.value, 10) || 500)
                  }
                  className="h-7"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Моточасы на момент ТО (необязательно)
                </p>
                <Input
                  type="number"
                  min={0}
                  value={engineHoursAtService}
                  onChange={(e) => setEngineHoursAtService(e.target.value)}
                  placeholder="—"
                  className="h-7"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Комментарий (необязательно)
                </p>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="—"
                  rows={2}
                  className="min-h-16 text-sm"
                />
              </div>
            </div>
          </PopoverBody>
          <PopoverFooter>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                type="submit"
                loading={createMutation.isPending}
              >
                Записать
              </Button>
            </div>
          </PopoverFooter>
          <PopoverCloseTrigger />
        </form>
      </PopoverContent>
    </PopoverRoot>
  )
}

/** Строк таблицы на странице (как в списке техники). */
const PER_PAGE = 20

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
      statusFilter: (o.statusFilter === "in_repair" ||
      o.statusFilter === "overdue" ||
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
  const scheduleStatusAnchorRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [equipmentForRecord, setEquipmentForRecord] = useState<{
    equipment: EquipmentPublic
    anchorEl: HTMLElement
  } | null>(null)
  const [scheduleSortBy, setScheduleSortBy] = useState<
    ScheduleSortField | undefined
  >(undefined)
  const [scheduleSortOrder, setScheduleSortOrder] =
    useState<ScheduleSortOrder>("asc")
  const [page, setPage] = useState(1)

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
    }) => equipmentApi.patchCurrentStatus(id, current_status),
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
  const intervalHours = (configData?.default_intervals ?? [500])[0] ?? 500
  const defaultRemindBefore = configData?.default_remind_before_hours ?? 50

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
      const status = resolveRowStatus(
        equipment,
        engineHours,
        nextAt,
        remindBefore,
      )
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
            const sa =
              `${a.equipment.brand_name ?? ""} ${a.equipment.model ?? ""}`.trim()
            const sb =
              `${b.equipment.brand_name ?? ""} ${b.equipment.model ?? ""}`.trim()
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

  const filteredCount = filteredRows.length
  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / PER_PAGE))

  const listViewKey = `${statusFilter}|${typeFilter}|${chainFilter}|${sortByChain}|${scheduleSortBy ?? ""}|${scheduleSortOrder}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: сброс страницы при смене фильтров/сортировки
  useEffect(() => {
    setPage(1)
  }, [listViewKey])

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * PER_PAGE
    return filteredRows.slice(start, start + PER_PAGE)
  }, [filteredRows, page])

  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = (page - 1) * PER_PAGE + pageItems.length

  const summary = useMemo(() => {
    const overdue = rows.filter((r) => r.status === "overdue").length
    const inRepair = rows.filter((r) => r.status === "in_repair").length
    const dueSoon = rows.filter((r) => r.status === "due_soon").length
    return { overdue, inRepair, dueSoon }
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
    return <p className="text-muted-foreground">Загрузка...</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/technique" search={{ section: "maintenance-schedule" }}>
          <Button size="sm" variant="outline">
            Перейти к расписанию ТО
          </Button>
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
            Просрочено: {summary.overdue}
          </span>
          <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            В ремонте: {summary.inRepair}
          </span>
          <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            Скоро: {summary.dueSoon}
          </span>
        </div>
        <div id="maintenance-schedule-export-menu" className="contents">
          <MenuRoot>
          <MenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              aria-label="Выгрузить отчёт"
            >
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Статус:
          </span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter((e.target.value || "") as ScheduleStatus | "")
            }
            className="rounded-md border border-border px-2.5 py-1.5 text-sm"
          >
            <option value="">Все</option>
            <option value="in_repair">В ремонте</option>
            <option value="overdue">Просрочено</option>
            <option value="due_soon">Скоро</option>
            <option value="ok">Норма</option>
          </select>
          <span className="ml-2 text-sm text-muted-foreground">
            Тип:
          </span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm"
          >
            <option value="">Все типы</option>
            {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="ml-2 text-sm text-muted-foreground">
            Последовательность ТО:
          </span>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            className="min-w-[160px] rounded-md border border-border px-2.5 py-1.5 text-sm"
          >
            <option value="">Все</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={sortByChain}
              onChange={(e) => setSortByChain(e.target.checked)}
              aria-label="Сортировать по последовательности ТО"
            />
            <span className="text-muted-foreground">
              Сортировать по последовательности
            </span>
          </label>
        </div>
      </div>

      <p className="mb-2 text-sm text-muted-foreground">
        Следующее ТО рассчитывается по моточасам (интервал из «Календарь ТО»:{" "}
        {intervalHours} м/ч). Статус «Скоро» настраивается в последовательности
        ТО (за N м/ч до ТО). Клик по строке — список проведённых ТО по этой
        технике.
      </p>

      <DialogRoot
        open={selectedEquipment != null}
        onOpenChange={(e) => {
          if (!e.open) setSelectedEquipment(null)
        }}
        placement="center"
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
        equipment={equipmentForRecord?.equipment ?? null}
        anchorEl={equipmentForRecord?.anchorEl ?? null}
        open={equipmentForRecord != null}
        onOpenChange={(open) => !open && setEquipmentForRecord(null)}
        onSuccess={refreshMaintenanceData}
      />

      {filteredRows.length === 0 ? (
        <p className="text-muted-foreground">Нет техники по выбранным фильтрам.</p>
      ) : (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map(
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
                    <TableRow
                      key={equipment.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedEquipment(equipment)}
                    >
                      <TableCell>
                        <span className="font-medium">
                          {equipment.brand_name} {equipment.model}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {EQUIPMENT_TYPE_LABELS[equipment.equipment_type] ??
                            equipment.equipment_type}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {equipment.serial_number || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {equipment.garage_number || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {primaryChainName ? (
                          (() => {
                            const chain = chains.find(
                              (c) => c.name === primaryChainName,
                            )
                            const colorPalette = chain?.colorTag ?? "gray"
                            return (
                              <span
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-xs",
                                  chainTagClass(colorPalette),
                                )}
                              >
                                {primaryChainName}
                              </span>
                            )
                          })()
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {lastMaintenanceAtHours != null
                            ? lastMaintenanceAtHours
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {engineHours != null ? engineHours : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {nextServiceAtHours != null
                            ? nextServiceAtHours
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {remaining != null
                            ? remaining
                            : status === "overdue"
                              ? "0"
                              : "—"}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div
                          id={`schedule-status-menu-${equipment.id}`}
                          className="contents"
                        >
                          <MenuRoot>
                          <MenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-block cursor-pointer border-0 bg-transparent p-0"
                              aria-label="Действия по статусу ТО"
                              ref={(el: HTMLButtonElement | null) => {
                                if (el)
                                  scheduleStatusAnchorRefs.current.set(
                                    equipment.id,
                                    el,
                                  )
                                else
                                  scheduleStatusAnchorRefs.current.delete(
                                    equipment.id,
                                  )
                              }}
                            >
                              <span
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-xs hover:opacity-90",
                                  STATUS_BADGE_CLASS[status],
                                )}
                              >
                                {STATUS_LABELS[status]}
                              </span>
                            </button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem
                              value={`to-maintenance-${equipment.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                updateStatusMutation.mutate({
                                  id: equipment.id,
                                  current_status: "maintenance",
                                })
                              }}
                              disabled={
                                updateStatusMutation.isPending ||
                                equipment.current_status === "maintenance"
                              }
                            >
                              Перевести на обслуживание
                            </MenuItem>
                            <MenuItem
                              value={`record-${equipment.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                const anchor =
                                  scheduleStatusAnchorRefs.current.get(
                                    equipment.id,
                                  ) ?? e.currentTarget
                                setEquipmentForRecord({
                                  equipment,
                                  anchorEl: anchor,
                                })
                              }}
                            >
                              Записать проведённое ТО
                            </MenuItem>
                          </MenuContent>
                          </MenuRoot>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                },
              )}
            </TableBody>
          </Table>
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground">
              {`Строки ${rangeStart}–${rangeEnd} из ${filteredCount}${
                filteredCount !== totalRows
                  ? ` (всего в графике: ${totalRows})`
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
        </div>
      )}
    </div>
  )
}

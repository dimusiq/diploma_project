/**
 * Расписание ТО — сервисные периоды и последовательность ТО (графики + техника).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { FiTrash2 } from "react-icons/fi"

import { EQUIPMENT_TYPE_LABELS, equipmentApi } from "@/api/equipment.ts"
import {
  apiChainToLegacyFormat,
  type MaintenanceChainCreateBody,
  type MaintenanceChainUpdateBody,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
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
import { cn } from "@/lib/utils.ts"
import {
  CHAIN_COLOR_OPTIONS,
  DEFAULT_REMIND_BEFORE_HOURS,
  getChainNameForEquipment,
  getEquipmentIdsInOtherChains,
  getMaintenanceChains,
  type MaintenanceChain,
} from "@/utils/maintenanceChains.ts"

const CHAIN_TAG_BADGE_CLASS: Record<string, string> = {
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

const CHAIN_SWATCH_BG: Record<string, string> = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
  violet: "bg-violet-500",
  indigo: "bg-indigo-500",
}

function chainTagBadgeClass(tag: string): string {
  return CHAIN_TAG_BADGE_CLASS[tag] ?? CHAIN_TAG_BADGE_CLASS.blue
}

function chainSwatchBg(tag: string): string {
  return CHAIN_SWATCH_BG[tag] ?? CHAIN_SWATCH_BG.blue
}

const STORAGE_KEY_IMPORT_DONE = "maintenance_schedule_import_done"

type UnsavedConfirmAction =
  | { action: "new" }
  | { action: "cancel" }
  | { action: "switch"; chain: MaintenanceChain }

export function MaintenanceScheduleEditor() {
  const queryClient = useQueryClient()
  const [newValue, setNewValue] = useState("")
  const [error, setError] = useState("")
  const [deleteChainId, setDeleteChainId] = useState<string | null>(null)
  const [unsavedConfirm, setUnsavedConfirm] =
    useState<UnsavedConfirmAction | null>(null)

  const [editingChainId, setEditingChainId] = useState<string | null>(null)
  const [chainName, setChainName] = useState("")
  const [chainColorTag, setChainColorTag] = useState<string>("blue")
  const [chainIntervals, setChainIntervals] = useState<number[]>([])
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Set<string>>(
    new Set(),
  )
  const [addIntervalValue, setAddIntervalValue] = useState<number>(500)
  const [chainRemindBeforeHours, setChainRemindBeforeHours] = useState<number>(
    DEFAULT_REMIND_BEFORE_HOURS,
  )
  const [equipmentSearch, setEquipmentSearch] = useState("")

  const { data: equipmentData } = useQuery({
    queryKey: ["equipment", "all"],
    queryFn: () => equipmentApi.list({ limit: 500, skip: 0 }),
  })
  const equipmentList = equipmentData?.data ?? []

  const { data: chainsData } = useQuery({
    queryKey: ["maintenance-chains"],
    queryFn: () => maintenanceScheduleApi.listChains(),
  })
  const { data: configData } = useQuery({
    queryKey: ["maintenance-schedule-config"],
    queryFn: () => maintenanceScheduleApi.getConfig(),
  })
  const { data: permissionsData } = useQuery({
    queryKey: ["maintenance-schedule-permissions"],
    queryFn: () => maintenanceScheduleApi.getPermissions(),
  })

  const chains: MaintenanceChain[] = useMemo(
    () => (chainsData?.data ?? []).map(apiChainToLegacyFormat),
    [chainsData?.data],
  )
  const canEdit = permissionsData?.can_edit ?? false
  const intervals = useMemo(
    () => configData?.default_intervals ?? [500, 1000, 1500, 2000, 2500],
    [configData?.default_intervals],
  )

  const updateConfigMutation = useMutation({
    mutationFn: (body: {
      default_intervals: number[]
      default_remind_before_hours: number
    }) => maintenanceScheduleApi.updateConfig(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance-schedule-config"],
      })
    },
  })

  const createChainMutation = useMutation({
    mutationFn: (body: MaintenanceChainCreateBody) =>
      maintenanceScheduleApi.createChain(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance-chains"],
      })
    },
  })
  const updateChainMutation = useMutation({
    mutationFn: ({
      chainId,
      body,
    }: {
      chainId: string
      body: MaintenanceChainUpdateBody
    }) => maintenanceScheduleApi.updateChain(chainId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance-chains"],
      })
    },
  })
  const deleteChainMutation = useMutation({
    mutationFn: (chainId: string) =>
      maintenanceScheduleApi.deleteChain(chainId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance-chains"],
      })
    },
  })

  useEffect(() => {
    if (!permissionsData?.can_edit || !chainsData || chainsData.data.length > 0)
      return
    if (typeof localStorage === "undefined") return
    if (localStorage.getItem(STORAGE_KEY_IMPORT_DONE)) return
    const localChains = getMaintenanceChains()
    if (localChains.length === 0) return
    const payload = localChains.map((c) => ({
      id: c.id,
      name: c.name,
      intervalHours: c.intervalHours,
      colorTag: c.colorTag,
      remindBeforeHours: c.remindBeforeHours,
      equipmentIds: c.equipmentIds,
    }))
    maintenanceScheduleApi
      .importFromLocal(payload)
      .then(() => {
        localStorage.setItem(STORAGE_KEY_IMPORT_DONE, "1")
        queryClient.invalidateQueries({
          queryKey: ["maintenance-chains"],
        })
      })
      .catch(() => {})
  }, [
    permissionsData?.can_edit,
    chainsData?.data?.length,
    queryClient,
    chainsData,
  ])

  const setIntervals = (next: number[] | ((prev: number[]) => number[])) => {
    const value = typeof next === "function" ? next(intervals) : next
    const valid = [...new Set(value)]
      .filter((x) => x > 0 && Number.isInteger(x))
      .sort((a, b) => a - b)
    if (valid.length > 0)
      updateConfigMutation.mutate({
        default_intervals: valid,
        default_remind_before_hours:
          configData?.default_remind_before_hours ?? 50,
      })
  }

  const handleAddInterval = () => {
    setError("")
    const num = parseInt(newValue.trim(), 10)
    if (Number.isNaN(num) || num < 1) {
      setError("Введите целое число больше 0 (моточасы)")
      return
    }
    if (intervals.includes(num)) {
      setError("Такой период уже есть")
      return
    }
    setIntervals((prev) => [...prev, num].sort((a, b) => a - b))
    setNewValue("")
  }

  const handleRemoveInterval = (value: number) => {
    setIntervals((prev) => prev.filter((x) => x !== value))
  }

  const doStartNewChain = () => {
    setEditingChainId("new")
    setChainName("")
    setChainColorTag("blue")
    setChainRemindBeforeHours(DEFAULT_REMIND_BEFORE_HOURS)
    setChainIntervals([])
    setAddIntervalValue(intervals[0] ?? 500)
    setSelectedEquipmentIds(new Set())
    initialFormSnapshot.current = {
      name: "",
      colorTag: "blue",
      remindBeforeHours: DEFAULT_REMIND_BEFORE_HOURS,
      intervalHours: [],
      equipmentIds: [],
    }
  }

  const startNewChain = () => {
    if (isFormDirty) {
      setUnsavedConfirm({ action: "new" })
      return
    }
    doStartNewChain()
  }

  const startEditChain = (chain: MaintenanceChain) => {
    setEditingChainId(chain.id)
    setChainName(chain.name)
    setChainColorTag(
      CHAIN_COLOR_OPTIONS.some((o) => o.value === chain.colorTag)
        ? chain.colorTag
        : "blue",
    )
    setChainRemindBeforeHours(
      chain.remindBeforeHours ?? DEFAULT_REMIND_BEFORE_HOURS,
    )
    setChainIntervals(
      Array.isArray(chain.intervalHours)
        ? [...chain.intervalHours]
        : chain.intervalHours
          ? [chain.intervalHours]
          : [],
    )
    setAddIntervalValue(intervals[0] ?? 500)
    setSelectedEquipmentIds(new Set(chain.equipmentIds))
    initialFormSnapshot.current = {
      name: chain.name,
      colorTag: chain.colorTag,
      remindBeforeHours: chain.remindBeforeHours ?? DEFAULT_REMIND_BEFORE_HOURS,
      intervalHours: Array.isArray(chain.intervalHours)
        ? [...chain.intervalHours]
        : [],
      equipmentIds: [...chain.equipmentIds].sort(),
    }
  }

  const addIntervalToChain = () => {
    setChainIntervals((prev) => [...prev, addIntervalValue])
  }

  const removeIntervalFromChain = (index: number) => {
    setChainIntervals((prev) => prev.filter((_, i) => i !== index))
  }

  const moveChainIntervalUp = (index: number) => {
    if (index <= 0) return
    setChainIntervals((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  const moveChainIntervalDown = (index: number) => {
    if (index >= chainIntervals.length - 1) return
    setChainIntervals((prev) => {
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  const initialFormSnapshot = useRef<{
    name: string
    colorTag: string
    remindBeforeHours: number
    intervalHours: number[]
    equipmentIds: string[]
  } | null>(null)

  const isFormDirty = useMemo(() => {
    if (editingChainId == null) return false
    const s = initialFormSnapshot.current
    if (!s) return false
    const nameMatch = chainName.trim() === s.name
    const colorMatch = chainColorTag === s.colorTag
    const remindMatch = chainRemindBeforeHours === s.remindBeforeHours
    const intervalsMatch =
      chainIntervals.length === s.intervalHours.length &&
      chainIntervals.every((v, i) => v === s.intervalHours[i])
    const ids = Array.from(selectedEquipmentIds).sort()
    const equipmentMatch =
      ids.length === s.equipmentIds.length &&
      ids.every((id, i) => id === s.equipmentIds[i])
    return !(
      nameMatch &&
      colorMatch &&
      remindMatch &&
      intervalsMatch &&
      equipmentMatch
    )
  }, [
    editingChainId,
    chainName,
    chainColorTag,
    chainRemindBeforeHours,
    chainIntervals,
    selectedEquipmentIds,
  ])

  const doCancelChainForm = () => {
    initialFormSnapshot.current = null
    setEditingChainId(null)
  }

  const cancelChainForm = () => {
    if (isFormDirty) {
      setUnsavedConfirm({ action: "cancel" })
      return
    }
    doCancelChainForm()
  }

  const handleRowClick = (c: MaintenanceChain) => {
    if (editingChainId === c.id) {
      cancelChainForm()
    } else {
      if (isFormDirty) {
        setUnsavedConfirm({ action: "switch", chain: c })
        return
      }
      startEditChain(c)
    }
  }

  const toggleEquipment = (id: string) => {
    setSelectedEquipmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** ID техники, которые уже в другой цепочке (не в текущей редактируемой). */
  const equipmentIdsInOtherChains = useMemo(
    () =>
      getEquipmentIdsInOtherChains(
        editingChainId && editingChainId !== "new" ? editingChainId : null,
        chains,
      ),
    [editingChainId, chains],
  )

  const filteredEquipmentList = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase()
    if (!q) return equipmentList
    return equipmentList.filter(
      (e) =>
        e.brand_name?.toLowerCase().includes(q) ||
        e.model?.toLowerCase().includes(q) ||
        e.serial_number?.toLowerCase().includes(q) ||
        e.garage_number?.toLowerCase().includes(q) ||
        String(EQUIPMENT_TYPE_LABELS[e.equipment_type] ?? e.equipment_type)
          .toLowerCase()
          .includes(q),
    )
  }, [equipmentList, equipmentSearch])

  const selectAllEquipment = () => {
    const availableIds = filteredEquipmentList
      .map((e) => e.id)
      .filter((id) => !equipmentIdsInOtherChains.has(id))
    if (selectedEquipmentIds.size === availableIds.length) {
      setSelectedEquipmentIds(new Set())
    } else {
      setSelectedEquipmentIds(new Set(availableIds))
    }
  }

  const handleSaveChain = () => {
    const name = chainName.trim()
    if (!name) {
      setError("Введите название последовательности")
      return
    }
    if (name.length > 40) {
      setError("Название цепочки ТО не должно превышать 40 символов.")
      return
    }
    const duplicate = chains.find(
      (c) =>
        c.id !== (editingChainId === "new" ? undefined : editingChainId) &&
        c.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      setError("Последовательность с таким названием уже существует.")
      return
    }
    if (chainIntervals.length === 0) {
      setError("Добавьте хотя бы один интервал в последовательность")
      return
    }
    const inOther = Array.from(selectedEquipmentIds).filter((id) =>
      equipmentIdsInOtherChains.has(id),
    )
    if (inOther.length > 0) {
      const names = inOther
        .slice(0, 3)
        .map((id) =>
          getChainNameForEquipment(
            id,
            editingChainId && editingChainId !== "new" ? editingChainId : null,
            chains,
          ),
        )
        .filter(Boolean)
      setError(
        `Техника может входить только в одну последовательность ТО. Выбрана техника, уже добавленная в другую последовательность${names.length ? ` (например: «${names.join("», «")}»)` : ""}.`,
      )
      return
    }
    setError("")
    const body = {
      name,
      interval_hours: chainIntervals,
      color_tag: chainColorTag,
      remind_before_hours: chainRemindBeforeHours,
      equipment_ids: Array.from(selectedEquipmentIds),
    }
    if (editingChainId === "new") {
      createChainMutation.mutate(body, {
        onSuccess: () => {
          initialFormSnapshot.current = null
          setEditingChainId(null)
        },
      })
    } else {
      updateChainMutation.mutate(
        { chainId: editingChainId!, body },
        {
          onSuccess: () => {
            initialFormSnapshot.current = null
            setEditingChainId(null)
          },
        },
      )
    }
  }

  const handleDeleteChain = (id: string) => {
    setDeleteChainId(id)
  }

  const handleDeleteChainConfirm = () => {
    if (!deleteChainId) return
    deleteChainMutation.mutate(deleteChainId, {
      onSuccess: () => {
        if (editingChainId === deleteChainId) setEditingChainId(null)
        setDeleteChainId(null)
      },
    })
  }

  const handleUnsavedConfirm = () => {
    if (!unsavedConfirm) return
    if (unsavedConfirm.action === "new") doStartNewChain()
    else if (unsavedConfirm.action === "cancel") doCancelChainForm()
    else if (unsavedConfirm.action === "switch")
      startEditChain(unsavedConfirm.chain)
    setUnsavedConfirm(null)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/technique/maintenance">
          <Button size="sm" variant="outline">
            Перейти к графику ТО
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Разделы:</span>
          <a href="#sequence-to">
            <Button size="xs" variant="outline">
              Последовательность ТО
            </Button>
          </a>
          <a href="#service-periods">
            <Button size="xs" variant="outline">
              Сервисные периоды
            </Button>
          </a>
        </div>
      </div>
      <div className="flex flex-col gap-8">
        {/* Последовательность ТО — выше на странице */}
        <div id="sequence-to">
          <h3 className="font-heading mb-2 text-sm font-semibold">
            Последовательность ТО
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Создайте последовательности из графика (интервала) и назначьте
            технику. Одна последовательность — один интервал и список техники.
          </p>

          {canEdit && (
            <Button
              className="mb-4"
              size="sm"
              variant="outline"
              onClick={startNewChain}
            >
              Создать последовательность ТО
            </Button>
          )}
          {!canEdit && (
            <p className="mb-4 text-sm text-muted-foreground">
              Только просмотр. Редактирование расписания недоступно.
            </p>
          )}
          {chains.length === 0 ? (
            <div className="mb-4 rounded-md border border-dashed border-border p-4 text-center">
              <p className="mb-2 text-sm text-muted-foreground">
                Нет последовательностей.
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                Создайте первую последовательность, выберите интервалы и
                назначьте технику.
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Интервалы (м/ч)</TableHead>
                    <TableHead>Напоминание за (м/ч)</TableHead>
                    <TableHead>Техника</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chains.map((c) => {
                    const tag = CHAIN_COLOR_OPTIONS.some(
                      (o) => o.value === c.colorTag,
                    )
                      ? c.colorTag
                      : "blue"
                    return (
                      <TableRow
                        key={c.id}
                        className={cn(
                          "cursor-pointer",
                          editingChainId === c.id && "bg-primary/10",
                        )}
                        onClick={() => handleRowClick(c)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-block h-3 w-4 shrink-0 rounded-sm border border-border",
                                chainSwatchBg(tag),
                              )}
                              title="Цветовое обозначение цепочки"
                              aria-hidden
                            />
                            <span className="font-medium">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {c.intervalHours.length > 0
                              ? c.intervalHours.join(" → ")
                              : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {c.remindBeforeHours ?? DEFAULT_REMIND_BEFORE_HOURS}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {c.equipmentIds.length} ед.
                          </span>
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <Button
                              size="icon-xs"
                              variant="outlineDestructive"
                              onClick={() => handleDeleteChain(c.id)}
                              title="Удалить"
                              aria-label="Удалить последовательность"
                            >
                              <FiTrash2 />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {editingChainId != null && (
            <div className="w-full rounded-md border border-border bg-muted/40 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-heading text-xs font-semibold">
                  {editingChainId === "new"
                    ? "Новая последовательность ТО"
                    : `Редактирование: ${chainName || "—"}`}
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelChainForm}
                  aria-label="Закрыть форму"
                >
                  Закрыть
                </Button>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-[100px] text-sm font-medium">
                    Название:
                  </span>
                  <Input
                    className="min-w-[200px] flex-1"
                    placeholder="Например: ТО каждые 500 м/ч"
                    value={chainName}
                    maxLength={40}
                    onChange={(e) => setChainName(e.target.value.slice(0, 40))}
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-[100px] text-sm font-medium">
                    Цветовое обозначение последовательности ТО:
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-w-[140px] justify-start gap-2 px-3 py-1.5"
                        disabled={!canEdit}
                      >
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-xs",
                            chainTagBadgeClass(chainColorTag),
                          )}
                        >
                          {CHAIN_COLOR_OPTIONS.find(
                            (o) => o.value === chainColorTag,
                          )?.label ?? chainColorTag}
                        </span>
                        <span className="text-sm text-muted-foreground">▼</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {CHAIN_COLOR_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          onSelect={() => setChainColorTag(opt.value)}
                        >
                          <span
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-xs",
                              chainTagBadgeClass(opt.value),
                            )}
                          >
                            {opt.label}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-[100px] text-sm font-medium">
                    Напоминание в графике ТО:
                  </span>
                  <span className="text-sm">за</span>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    className="h-7 w-[90px]"
                    value={chainRemindBeforeHours}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      if (!Number.isNaN(n) && n >= 0)
                        setChainRemindBeforeHours(n)
                    }}
                    disabled={!canEdit}
                  />
                  <span className="text-sm text-muted-foreground">
                    моточасов до ТО (статус «Скоро»)
                  </span>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">
                    Последовательность интервалов (м/ч):
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Порядок можно менять кнопками ↑ ↓. Первый интервал
                    используется для расчёта «следующее ТО» в графике.
                  </p>
                  {canEdit && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Select
                        value={String(addIntervalValue)}
                        onValueChange={(v) => setAddIntervalValue(Number(v))}
                      >
                        <SelectTrigger className="h-9 min-w-[120px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {intervals.map((val) => (
                            <SelectItem key={val} value={String(val)}>
                              {val} м/ч
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outlineSky"
                        onClick={addIntervalToChain}
                      >
                        Добавить в цепочку
                      </Button>
                    </div>
                  )}
                  {chainIntervals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Нет интервалов. Выберите интервал выше и нажмите «Добавить
                      в цепочку».
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {chainIntervals.map((val, index) => (
                        <div
                          key={`${val}-${index}`}
                          className="flex items-center gap-2"
                        >
                          <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
                            {val} м/ч
                          </span>
                          {canEdit && (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => moveChainIntervalUp(index)}
                                title="Поднять"
                              >
                                ↑
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => moveChainIntervalDown(index)}
                                title="Опустить"
                              >
                                ↓
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="outlineDestructive"
                                onClick={() => removeIntervalFromChain(index)}
                                title="Удалить"
                                aria-label="Удалить интервал из последовательности"
                              >
                                <FiTrash2 />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      Техника в последовательности:
                    </span>
                    {canEdit && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={selectAllEquipment}
                      >
                        {selectedEquipmentIds.size ===
                        filteredEquipmentList.filter(
                          (e) => !equipmentIdsInOtherChains.has(e.id),
                        ).length
                          ? "Снять все"
                          : "Выбрать всю"}
                      </Button>
                    )}
                  </div>
                  <Input
                    className="mb-2 max-w-[320px]"
                    placeholder="Поиск по названию, модели, серийному номеру..."
                    value={equipmentSearch}
                    onChange={(e) => setEquipmentSearch(e.target.value)}
                  />
                  <p className="mb-2 text-xs text-muted-foreground">
                    Техника может входить только в одну последовательность ТО.
                    Занятая в другой последовательности техника недоступна для
                    выбора.
                  </p>
                  <div className="max-h-[400px] overflow-y-auto rounded-md border border-border bg-background p-2">
                    {equipmentList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Нет техники. Добавьте технику в разделе «Список
                        техники».
                      </p>
                    ) : filteredEquipmentList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Ничего не найдено по запросу. Измените поиск.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredEquipmentList.map((eq) => {
                          const inOtherChain = equipmentIdsInOtherChains.has(
                            eq.id,
                          )
                          const otherChainName = inOtherChain
                            ? getChainNameForEquipment(
                                eq.id,
                                editingChainId && editingChainId !== "new"
                                  ? editingChainId
                                  : null,
                                chains,
                              )
                            : null
                          return (
                            <Checkbox
                              key={eq.id}
                              checked={selectedEquipmentIds.has(eq.id)}
                              disabled={inOtherChain || !canEdit}
                              onCheckedChange={() =>
                                !inOtherChain &&
                                canEdit &&
                                toggleEquipment(eq.id)
                              }
                            >
                              <span
                                className={cn(
                                  "text-sm",
                                  inOtherChain && "opacity-70",
                                )}
                              >
                                {eq.brand_name} {eq.model}
                                {eq.garage_number && (
                                  <span className="block text-xs text-muted-foreground">
                                    Гаражный номер: {eq.garage_number}
                                  </span>
                                )}
                                {eq.serial_number && (
                                  <span className="ml-2 text-muted-foreground">
                                    ({eq.serial_number})
                                  </span>
                                )}
                                {" · "}
                                {EQUIPMENT_TYPE_LABELS[eq.equipment_type] ??
                                  eq.equipment_type}
                                {otherChainName && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    в цепочке «{otherChainName}»
                                  </span>
                                )}
                              </span>
                            </Checkbox>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={handleSaveChain}>
                      Сохранить
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={cancelChainForm}>
                    {canEdit ? "Отмена" : "Закрыть"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Сервисные периоды */}
        <div id="service-periods">
          <h3 className="font-heading mb-2 text-sm font-semibold">
            Сервисные периоды (м/ч)
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Отметки в моточасах для ТО (500, 1000, 1500 и т.д.). Первый период
            используется в «График ТО» по умолчанию.
          </p>
          {canEdit && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                step={100}
                placeholder="Моточасы (например 500)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleAddInterval())
                }
                className="h-7 w-[180px]"
              />
              <Button variant="outlineSky" size="sm" onClick={handleAddInterval}>
                Добавить период
              </Button>
            </div>
          )}
          {error && !editingChainId && (
            <p className="mb-2 text-sm text-destructive">{error}</p>
          )}
          {intervals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет периодов. Добавьте первый (например 500).
            </p>
          ) : (
            <div className="w-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Период (м/ч)</TableHead>
                    <TableHead className="text-right">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intervals.map((value) => (
                    <TableRow key={value}>
                      <TableCell>
                        <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
                          {value}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && (
                          <Button
                            size="xs"
                            variant="outlineDestructive"
                            onClick={() => handleRemoveInterval(value)}
                          >
                            Удалить
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={deleteChainId != null}
        onOpenChange={(open) => !open && setDeleteChainId(null)}
        title="Удалить последовательность ТО?"
        description="Удалить эту последовательность? Это действие нельзя отменить."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteChainMutation.isPending}
        onConfirm={handleDeleteChainConfirm}
      />
      <ConfirmDialog
        open={unsavedConfirm != null}
        onOpenChange={(open) => !open && setUnsavedConfirm(null)}
        title="Несохранённые изменения"
        description={
          unsavedConfirm?.action === "new"
            ? "Есть несохранённые изменения. Переключиться без сохранения?"
            : unsavedConfirm?.action === "cancel"
              ? "Есть несохранённые изменения. Закрыть без сохранения?"
              : "Есть несохранённые изменения. Переключиться без сохранения?"
        }
        confirmLabel="Да, не сохранять"
        cancelLabel="Отмена"
        onConfirm={handleUnsavedConfirm}
      />
    </div>
  )
}

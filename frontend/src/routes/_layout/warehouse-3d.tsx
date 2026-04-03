import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { FiChevronRight, FiMaximize2, FiRotateCcw } from "react-icons/fi"
import { z } from "zod"
import { equipmentApi } from "@/api/equipment.ts"
import {
  fetchWarehouseLayout,
  specToLayoutGeometry,
} from "@/api/warehouseLayout.ts"
import { fetchWarehouseRouteGraph } from "@/api/warehouseRouteGraph.ts"
import { warehouseTopologyApi } from "@/api/warehouseTopology.ts"
import type { ItemPublic } from "@/client/index.ts"
import { ItemsService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import {
  blockedCellKeysFromTopology,
  type CellStripe,
  type HeatMetric,
  heatMapForMetric,
  replenishmentNeedByCellKey,
  slaRiskByCellKey,
  stripeByCellKey,
} from "@/components/warehouse3d/twin3dDerived.ts"
import type {
  CellInfo,
  CellItemInfo,
  TwinOverlayMode,
  WarehouseEquipmentKind,
  WarehouseInteractionMode,
  WarehouseTwinEnrichment,
} from "@/components/warehouse3d/WarehouseScene.tsx"
import {
  buildWarehouseGeometry,
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import { cn } from "@/lib/utils.ts"

const WarehouseScene = lazy(() =>
  import("@/components/warehouse3d/WarehouseScene.tsx").then((m) => ({
    default: m.WarehouseScene,
  })),
)

const warehouse3dSearchSchema = z.object({
  row: z.coerce.number().min(1).max(12).optional(),
  level: z.coerce.number().min(1).max(4).optional(),
  cellX: z.coerce.number().min(1).max(20).optional(),
  cellZ: z.coerce.number().min(1).max(1).optional(),
})

export const Route = createFileRoute("/_layout/warehouse-3d")({
  component: Warehouse3DPage,
  validateSearch: (search) => warehouse3dSearchSchema.parse(search),
})

const EXPIRING_DAYS = 30

function cellKeyFromItem(
  row: number,
  level: number,
  cellX: number,
  cellZ: number,
): string {
  return `${row - 1}-${level - 1}-${cellX - 1}-${cellZ - 1}`
}

function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const exp = new Date(expiresAt)
  const now = new Date()
  const daysLeft = Math.ceil(
    (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  )
  return daysLeft >= 0 && daysLeft <= EXPIRING_DAYS
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const exp = new Date(expiresAt)
  exp.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return exp.getTime() < today.getTime()
}

/** Количество дней просрочки (положительное число). 0 если не просрочен. */
function getExpiredDays(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0
  const exp = new Date(expiresAt)
  exp.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil(
    (today.getTime() - exp.getTime()) / (24 * 60 * 60 * 1000),
  )
  return diff > 0 ? diff : 0
}

function findItemInCell(
  items: ItemPublic[] | undefined,
  cell: CellInfo,
): ItemPublic | undefined {
  if (!items?.length) return undefined
  return items.find(
    (i) =>
      i.storage_row === cell.row + 1 &&
      i.storage_level === cell.level + 1 &&
      i.storage_cell_x === cell.cellX + 1 &&
      (i.storage_cell_z ?? 1) === cell.cellZ + 1,
  )
}

function searchToCellInfo(
  search: z.infer<typeof warehouse3dSearchSchema>,
): CellInfo | null {
  if (search.row != null && search.level != null && search.cellX != null) {
    return {
      row: search.row - 1,
      level: search.level - 1,
      cellX: search.cellX - 1,
      cellZ: (search.cellZ ?? 1) - 1,
      filled: false,
    }
  }
  return null
}

function Warehouse3DPage() {
  const search = Route.useSearch()
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [selectedCell, setSelectedCell] = useState<CellInfo | null>(() =>
    searchToCellInfo(search),
  )
  /** Фокус камеры только при переходе по «Показать на складе 3D»; после применения сбрасывается. */
  const [focusCell, setFocusCell] = useState<CellInfo | null>(null)
  const [sceneKey, setSceneKey] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [interactionMode, setInteractionMode] =
    useState<WarehouseInteractionMode>("view")
  const [routeWaypoints, setRouteWaypoints] = useState<CellInfo[]>([])
  const [simulationActive, setSimulationActive] = useState(false)
  const [equipmentKind, setEquipmentKind] =
    useState<WarehouseEquipmentKind>("forklift")
  const [simulationSpeed, setSimulationSpeed] = useState(1.25)
  const [simulationShowCargo, setSimulationShowCargo] = useState(true)
  const [liveData, setLiveData] = useState(false)
  const [overlayMode, setOverlayMode] = useState<TwinOverlayMode>("standard")
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("congestion")
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [snapshots, setSnapshots] = useState<
    Array<{ at: number; items: ItemPublic[] }>
  >([])
  const snapThrottleRef = useRef(0)

  const addRouteWaypoint = useCallback((cell: CellInfo) => {
    setRouteWaypoints((prev) => [...prev, { ...cell }])
  }, [])

  const clearRoute = useCallback(() => {
    setRouteWaypoints([])
    setSimulationActive(false)
  }, [])

  const popRouteWaypoint = useCallback(() => {
    setRouteWaypoints((prev) => prev.slice(0, -1))
  }, [])

  const handleSimulationComplete = useCallback(() => {
    setSimulationActive(false)
  }, [])

  const startSimulation = useCallback(() => {
    if (routeWaypoints.length < 2) return
    setSimulationActive(true)
  }, [routeWaypoints.length])

  const stopSimulation = useCallback(() => {
    setSimulationActive(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = canvasContainerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    const fromUrl = searchToCellInfo(search)
    if (fromUrl) {
      setSelectedCell(fromUrl)
      // Фокус камеры только при смене URL (переход по ссылке из списка), не при клике по ячейке
      setFocusCell(fromUrl)
    }
  }, [search.row, search.level, search.cellX, search.cellZ, search])

  useEffect(() => {
    if (!selectedCell) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCell(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedCell])

  const resetCamera = useCallback(() => setSceneKey((k) => k + 1), [])

  const { data: itemsData } = useQuery({
    queryKey: ["items", "all-for-warehouse-3d"],
    queryFn: () => ItemsService.readItems({ skip: 0, limit: 1000 }),
    refetchInterval: liveData ? 2500 : false,
  })

  const { data: layoutApi } = useQuery({
    queryKey: ["warehouse", "layout"],
    queryFn: fetchWarehouseLayout,
    staleTime: 60_000,
  })

  const { data: topology } = useQuery({
    queryKey: ["warehouse", "topology"],
    queryFn: warehouseTopologyApi.get,
    staleTime: 60_000,
  })

  const { data: routeGraph } = useQuery({
    queryKey: ["warehouse", "route-graph"],
    queryFn: fetchWarehouseRouteGraph,
    staleTime: 60_000,
  })

  const { data: equipmentResponse } = useQuery({
    queryKey: ["equipment", "all-warehouse-3d"],
    queryFn: () => equipmentApi.list({ limit: 200, skip: 0 }),
    staleTime: 60_000,
  })

  const layoutSpec = useMemo(
    () => specToLayoutGeometry(layoutApi?.spec),
    [layoutApi?.spec],
  )

  const addSelectedCellToRoute = useCallback(() => {
    if (!selectedCell || simulationActive) return
    addRouteWaypoint(selectedCell)
  }, [selectedCell, simulationActive, addRouteWaypoint])

  const setDemoRoute = useCallback(() => {
    if (simulationActive) return
    const spec = layoutSpec ?? DEFAULT_WAREHOUSE_LAYOUT_SPEC
    const endX = Math.max(0, spec.cellX - 1)
    const z = Math.max(0, spec.cellZ - 1)
    setRouteWaypoints([
      { row: 0, level: 0, cellX: 0, cellZ: z, filled: false },
      { row: 0, level: 0, cellX: endX, cellZ: z, filled: false },
    ])
  }, [layoutSpec, simulationActive])

  const items = itemsData?.data ?? []

  useEffect(() => {
    if (items.length === 0) return
    const now = Date.now()
    if (now - snapThrottleRef.current < 12_000) return
    snapThrottleRef.current = now
    setSnapshots((prev) => [...prev.slice(-35), { at: now, items: [...items] }])
  }, [items])

  const displayItems = useMemo(() => {
    if (historyIdx < 0 || historyIdx >= snapshots.length) return items
    return snapshots[historyIdx]?.items ?? items
  }, [items, snapshots, historyIdx])

  useEffect(() => {
    if (historyIdx >= snapshots.length) setHistoryIdx(-1)
  }, [snapshots.length, historyIdx])

  const layoutSpecResolved = layoutSpec ?? DEFAULT_WAREHOUSE_LAYOUT_SPEC
  const geom = useMemo(
    () => buildWarehouseGeometry(layoutSpecResolved),
    [
      layoutSpecResolved.rows,
      layoutSpecResolved.levels,
      layoutSpecResolved.cellX,
      layoutSpecResolved.cellZ,
      layoutSpecResolved,
    ],
  )

  const twinLayerVisibility = useMemo(() => {
    switch (overlayMode) {
      case "occupancy":
        return {
          zones: true,
          aisles: true,
          routeGraph: false,
          equipment: false,
        }
      case "workload":
        return {
          zones: true,
          aisles: false,
          routeGraph: false,
          equipment: false,
        }
      case "replenishment_need":
        return {
          zones: false,
          aisles: false,
          routeGraph: false,
          equipment: false,
        }
      case "anomaly_alerts":
        return {
          zones: true,
          aisles: true,
          routeGraph: true,
          equipment: false,
        }
      case "maintenance_safety":
        return {
          zones: false,
          aisles: true,
          routeGraph: true,
          equipment: true,
        }
      default:
        return {
          zones: false,
          aisles: false,
          routeGraph: false,
          equipment: false,
        }
    }
  }, [overlayMode])

  const twinHeatByCellKey = useMemo(() => {
    if (overlayMode === "workload") {
      return heatMapForMetric(heatMetric, displayItems, geom)
    }
    if (overlayMode === "replenishment_need") {
      return replenishmentNeedByCellKey(displayItems)
    }
    if (overlayMode === "anomaly_alerts") {
      return slaRiskByCellKey(displayItems)
    }
    return new Map<string, number>()
  }, [overlayMode, heatMetric, displayItems, geom])

  const twinHazardByCellKey = useMemo((): Map<string, CellStripe> => {
    const m = new Map<string, CellStripe>()
    if (overlayMode !== "anomaly_alerts") return m
    const st = stripeByCellKey(displayItems)
    for (const [k, v] of st) m.set(k, v)
    const blocked = blockedCellKeysFromTopology(geom, topology ?? null)
    for (const k of blocked) {
      if (!m.has(k)) m.set(k, "blocked")
    }
    return m
  }, [overlayMode, displayItems, geom, topology])

  const twinEnrichment: WarehouseTwinEnrichment | null = useMemo(
    () => ({
      overlayMode,
      topology: topology ?? null,
      routeGraph: routeGraph ?? null,
      equipmentList: equipmentResponse?.data ?? [],
      twinHeatByCellKey,
      twinHazardByCellKey,
      twinLayerVisibility,
    }),
    [
      overlayMode,
      topology,
      routeGraph,
      equipmentResponse?.data,
      twinHeatByCellKey,
      twinHazardByCellKey,
      twinLayerVisibility,
    ],
  )

  const occupiedCellKeys = useMemo(() => {
    const set = new Set<string>()
    displayItems.forEach((item) => {
      if (item.slot_key) {
        set.add(item.slot_key)
        return
      }
      const r = item.storage_row
      const l = item.storage_level
      const x = item.storage_cell_x
      const z = item.storage_cell_z
      if (r != null && l != null && x != null && z != null) {
        set.add(cellKeyFromItem(r, l, x, z))
      }
    })
    return set
  }, [displayItems])

  const expiringCellKeys = useMemo(() => {
    const set = new Set<string>()
    displayItems.forEach((item) => {
      if (!isExpiringSoon(item.expires_at ?? null)) return
      if (item.slot_key) {
        set.add(item.slot_key)
        return
      }
      const r = item.storage_row
      const l = item.storage_level
      const x = item.storage_cell_x
      const z = item.storage_cell_z
      if (r != null && l != null && x != null && z != null) {
        set.add(cellKeyFromItem(r, l, x, z))
      }
    })
    return set
  }, [displayItems])

  const expiredCellKeys = useMemo(() => {
    const set = new Set<string>()
    displayItems.forEach((item) => {
      if (!isExpired(item.expires_at ?? null)) return
      if (item.slot_key) {
        set.add(item.slot_key)
        return
      }
      const r = item.storage_row
      const l = item.storage_level
      const x = item.storage_cell_x
      const z = item.storage_cell_z
      if (r != null && l != null && x != null && z != null) {
        set.add(cellKeyFromItem(r, l, x, z))
      }
    })
    return set
  }, [displayItems])

  const selectedItem = useMemo(
    () =>
      selectedCell ? findItemInCell(displayItems, selectedCell) : undefined,
    [selectedCell, displayItems],
  )

  const selectedItemForPopup = useMemo((): CellItemInfo | null => {
    if (!selectedItem) return null
    const expiresAt = selectedItem.expires_at ?? null
    const expired = isExpired(expiresAt)
    return {
      id: selectedItem.id,
      title: selectedItem.title,
      description: selectedItem.description ?? null,
      quantity: selectedItem.quantity ?? 1,
      unit: selectedItem.unit ?? null,
      sku: selectedItem.sku ?? null,
      expires_at: expiresAt,
      location: selectedItem.location ?? null,
      status: selectedItem.status,
      expiringSoon: !expired && isExpiringSoon(expiresAt),
      isExpired: expired,
      expiredDays: expired ? getExpiredDays(expiresAt) : undefined,
    }
  }, [selectedItem])

  return (
    <div className="mx-auto w-full max-w-full py-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <RouterLink
          to="/warehouse"
          className="font-medium text-primary hover:underline"
        >
          Склад
        </RouterLink>
        <FiChevronRight className="size-3 shrink-0" aria-hidden />
        <span>Цифровой двойник</span>
      </div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-heading text-2xl font-semibold tracking-tight">
            3D модель склада
          </h1>
          <p className="text-sm text-muted-foreground">
            Ячейки заполняются только при добавлении товара с выбранной ячейкой.
            Клик по ячейке — всплывающее окно. Красное мигание — срок годности
            истекает в течение {EXPIRING_DAYS} дн. Симуляция движения техники и
            маршрут — только визуализация, позиции товаров в БД не меняются.
            {layoutApi != null && (
              <>
                {" "}
                Layout v{layoutApi.version} ({layoutApi.code}).
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#9ca3af]" />
          <span>Пусто</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#3b82f6]" />
          <span>Занято</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#dc2626]" />
          <span>Срок истекает</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#7f1d1d]" />
          <span>Просрочено</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#fbbf24]" />
          <span>Выбрано</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#ea580c]" />
          <span>Маршрут</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#a855f7]" />
          <span>Блок / буфер (ряд)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#f59e0b]" />
          <span>Резерв (отгрузка)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#7c3aed]" />
          <span>Карантин / приёмка</span>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">
          Digital twin: зоны, маршруты, heatmap
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Зоны и проходы — из топологии склада. Граф — из{" "}
          <code>GET /warehouse/route-graph</code> (нужна синхронизация графа).
          Heatmap считается в браузере. Слайдер времени — локальные снимки
          списка товаров (~12 с).
        </p>
        <div className="flex flex-wrap items-end gap-3 md:gap-4">
          <div className="min-w-[200px]">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Режим наложения
            </p>
            <Select
              value={overlayMode}
              onValueChange={(v) => setOverlayMode(v as TwinOverlayMode)}
            >
              <SelectTrigger className="h-9 w-full max-w-[280px] text-sm">
                <SelectValue placeholder="Режим" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Стандарт</SelectItem>
                <SelectItem value="occupancy">
                  Занятость + зоны / проходы
                </SelectItem>
                <SelectItem value="workload">Нагрузка (heatmap)</SelectItem>
                <SelectItem value="replenishment_need">
                  Потребность в пополнении
                </SelectItem>
                <SelectItem value="anomaly_alerts">
                  Аномалии (SLA + блок/резерв/карантин)
                </SelectItem>
                <SelectItem value="maintenance_safety">
                  Техника + граф + проходы
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {overlayMode === "workload" && (
            <div className="min-w-[180px]">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Метрика heatmap
              </p>
              <Select
                value={heatMetric}
                onValueChange={(v) => setHeatMetric(v as HeatMetric)}
              >
                <SelectTrigger className="h-9 w-full max-w-[260px] text-sm">
                  <SelectValue placeholder="Метрика" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="congestion">
                    Загруженность рядов
                  </SelectItem>
                  <SelectItem value="pick_density">Остаток в ячейке</SelectItem>
                  <SelectItem value="sla_risk">
                    Риск по сроку годности
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-[220px] flex-1">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Снимок данных (время)
            </p>
            <input
              type="range"
              min={-1}
              max={Math.max(-1, snapshots.length - 1)}
              step={1}
              value={historyIdx}
              onChange={(e) => setHistoryIdx(Number(e.target.value))}
              disabled={snapshots.length === 0}
              aria-label="Снимок состояния товаров"
              style={{ width: "100%", maxWidth: 360 }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {historyIdx < 0 || snapshots.length === 0
                ? "Текущие данные с сервера"
                : `Снимок: ${new Date(snapshots[historyIdx]!.at).toLocaleString("ru-RU")}`}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-3 min-h-[108px] rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Симуляция и маршрут</p>
        <div className="flex flex-wrap items-start gap-3 md:gap-4">
          <div className="flex min-w-[200px] flex-col gap-2">
            <Checkbox
              checked={liveData}
              onCheckedChange={(c) => setLiveData(c)}
            >
              Доп. опрос списка (~2,5 с) — помимо SSE по всему приложению
            </Checkbox>
            <Checkbox
              checked={interactionMode === "route"}
              onCheckedChange={(c) => {
                const on = c
                setInteractionMode(on ? "route" : "view")
                if (on) setSelectedCell(null)
              }}
            >
              Прокладка маршрута (клик по ячейкам по порядку)
            </Checkbox>
            {interactionMode === "route" && (
              <p className="text-xs text-muted-foreground">
                Попап ячейки в этом режиме отключён; точки — оранжевая линия на
                полу.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              В обычном режиме: <strong>Shift+клик</strong> по ячейке добавляет
              точку маршрута.
            </p>
          </div>
          <div className="flex min-w-[180px] flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Техника</p>
            <Select
              value={equipmentKind}
              onValueChange={(v) =>
                setEquipmentKind(v as WarehouseEquipmentKind)
              }
            >
              <SelectTrigger className="h-9 max-w-[220px] text-sm">
                <SelectValue placeholder="Техника" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forklift">Вилочный погрузчик</SelectItem>
                <SelectItem value="pallet_jack">
                  Рохля (гидравлическая тележка)
                </SelectItem>
              </SelectContent>
            </Select>
            <Checkbox
              checked={simulationShowCargo}
              onCheckedChange={(c) => setSimulationShowCargo(c)}
              disabled={equipmentKind !== "forklift"}
            >
              Показать груз на вилах (погрузчик)
            </Checkbox>
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Скорость симуляции
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.4}
                max={3}
                step={0.05}
                value={simulationSpeed}
                onChange={(e) =>
                  setSimulationSpeed(Number.parseFloat(e.target.value))
                }
                style={{ flex: 1, maxWidth: 200 }}
                aria-label="Скорость симуляции"
              />
              <span className="w-8 text-xs text-muted-foreground">
                {simulationSpeed.toFixed(2)}×
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Точек маршрута: {routeWaypoints.length}
            </p>
            {routeWaypoints.length < 2 && !simulationActive && (
              <p className="max-w-lg text-xs text-orange-700 dark:text-orange-400">
                Кнопка «Запустить» станет доступна после{" "}
                <strong>двух точек</strong>: «Пример маршрута», дважды «В
                маршрут» (сначала выберите ячейку кликом), режим прокладки или
                Shift+клик по ячейкам.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={addSelectedCellToRoute}
                disabled={!selectedCell || simulationActive}
              >
                В маршрут (выбранная ячейка)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={setDemoRoute}
                disabled={simulationActive}
              >
                Пример маршрута (2 точки)
              </Button>
              <Button
                size="sm"
                variant="solid"
                onClick={startSimulation}
                disabled={routeWaypoints.length < 2 || simulationActive}
              >
                Запустить симуляцию
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={stopSimulation}
                disabled={!simulationActive}
              >
                Стоп
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={popRouteWaypoint}
                disabled={routeWaypoints.length === 0 || simulationActive}
              >
                Убрать последнюю точку
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearRoute}
                disabled={routeWaypoints.length === 0 && !simulationActive}
              >
                Сбросить маршрут
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={canvasContainerRef}
        className={cn(
          "relative w-full",
          isFullscreen && "min-h-screen h-screen w-screen bg-muted",
        )}
      >
        <div
          className={cn(
            "w-full overflow-hidden bg-muted",
            isFullscreen
              ? "h-full min-h-0"
              : "min-h-[480px] h-[calc(100vh-200px)] rounded-lg",
          )}
        >
          <Suspense
            fallback={
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <Skeleton w="100%" h="100%" minH="200px" borderRadius="lg" />
                <p className="text-sm text-muted-foreground">Загрузка 3D…</p>
              </div>
            }
          >
            <WarehouseScene
              key={sceneKey}
              selectedCell={selectedCell}
              focusCell={focusCell}
              onFocusDone={() => setFocusCell(null)}
              onCellSelect={setSelectedCell}
              occupiedCellKeys={occupiedCellKeys}
              expiringCellKeys={expiringCellKeys}
              expiredCellKeys={expiredCellKeys}
              selectedItem={selectedItemForPopup}
              darkMode={false}
              layoutSpec={layoutSpec ?? undefined}
              interactionMode={interactionMode}
              routeWaypoints={routeWaypoints}
              onRouteWaypointAdd={addRouteWaypoint}
              simulationActive={simulationActive}
              simulationEquipment={equipmentKind}
              simulationSpeed={simulationSpeed}
              simulationShowCargo={simulationShowCargo}
              onSimulationComplete={handleSimulationComplete}
              twinEnrichment={twinEnrichment}
            />
          </Suspense>
        </div>
        <div className="absolute right-2 top-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            title="Полноэкранный режим"
            aria-label="Полноэкранный режим"
          >
            <FiMaximize2 className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resetCamera}
            title="Вернуть вид по умолчанию"
            aria-label="Сбросить камеру"
          >
            <span className="inline-flex items-center gap-2">
              <FiRotateCcw className="size-4" />
              Сбросить камеру
            </span>
          </Button>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Вращение: ЛКМ · Zoom: колёсико · Панорама: ПКМ или Shift+ЛКМ · Клик по
        ячейке — информация (режим просмотра); Shift+клик — точка маршрута ·
        Escape — закрыть окно · Живое обновление подтягивает занятость ячеек с
        сервера без перезагрузки страницы
      </p>
    </div>
  )
}

import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { useTheme } from "next-themes"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ErrorBoundary } from "react-error-boundary"
import {
  FiChevronRight,
  FiMaximize2,
  FiMove,
  FiRotateCcw,
  FiSliders,
} from "react-icons/fi"
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
import { ErrorFallback } from "@/components/Common/ErrorFallback.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { Tabs } from "@/components/ui/tabs.tsx"
import {
  blockedCellKeysFromTopology,
  type CellStripe,
  type HeatMetric,
  heatMapForMetric,
  replenishmentNeedByCellKey,
  slaRiskByCellKey,
  stripeByCellKey,
} from "@/components/warehouse3d/twin3dDerived.ts"
import {
  Warehouse3DToolsPanelContent,
  type Warehouse3DToolsTab,
} from "@/components/warehouse3d/Warehouse3dToolsPanels.tsx"
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

const WAREHOUSE_3D_TOOLS_TAB_KEY = "nebardak.warehouse3d.toolsTab"

function readStoredToolsTab(): Warehouse3DToolsTab {
  if (typeof window === "undefined") return "scene"
  try {
    const v = localStorage.getItem(WAREHOUSE_3D_TOOLS_TAB_KEY)
    if (v === "scene" || v === "route" || v === "twin") return v
  } catch {
    /* ignore */
  }
  return "scene"
}

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
  const { resolvedTheme } = useTheme()
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
  const [freeCameraMode, setFreeCameraMode] = useState(false)
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
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    if (items.length === 0) return
    const now = Date.now()
    if (now - snapThrottleRef.current < 12_000) return
    snapThrottleRef.current = now
    setSnapshots((prev) => [
      ...prev.slice(-35),
      { at: now, items: [...itemsRef.current] },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

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
      layoutSpecResolved.cellZ, layoutSpecResolved
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

  const [toolsTab, setToolsTab] = useState<Warehouse3DToolsTab>(() =>
    readStoredToolsTab(),
  )
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)

  const persistToolsTab = useCallback((v: string) => {
    const t: Warehouse3DToolsTab =
      v === "route" || v === "twin" ? v : "scene"
    setToolsTab(t)
    try {
      localStorage.setItem(WAREHOUSE_3D_TOOLS_TAB_KEY, t)
    } catch {
      /* ignore */
    }
  }, [])

  const toolsPanelProps = useMemo(
    () => ({
      liveData,
      setLiveData,
      interactionMode,
      setInteractionMode,
      setSelectedCell,
      equipmentKind,
      setEquipmentKind,
      simulationShowCargo,
      setSimulationShowCargo,
      simulationSpeed,
      setSimulationSpeed,
      routeWaypoints,
      simulationActive,
      selectedCell,
      addSelectedCellToRoute,
      setDemoRoute,
      startSimulation,
      stopSimulation,
      popRouteWaypoint,
      clearRoute,
      overlayMode,
      setOverlayMode,
      heatMetric,
      setHeatMetric,
      historyIdx,
      setHistoryIdx,
      snapshots,
    }),
    [
      liveData,
      interactionMode,
      equipmentKind,
      simulationShowCargo,
      simulationSpeed,
      routeWaypoints,
      simulationActive,
      selectedCell,
      addSelectedCellToRoute,
      setDemoRoute,
      startSimulation,
      stopSimulation,
      popRouteWaypoint,
      clearRoute,
      overlayMode,
      heatMetric,
      historyIdx,
      snapshots,
    ],
  )

  return (
    <div className="mx-auto w-full max-w-full py-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild size="xs" variant="outline" className="font-medium">
          <RouterLink to="/warehouse">Склад</RouterLink>
        </Button>
        <FiChevronRight className="size-3 shrink-0" aria-hidden />
        <span>Цифровой двойник</span>
      </div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              3D модель склада
            </h1>
            {layoutApi != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                layout v{layoutApi.version} · {layoutApi.code}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Клик — карточка ячейки. Shift+клик — точка маршрута. Симуляция не
            меняет БД.
          </p>
          <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
            <RouterLink to="/warehouse-3d-help">
              Справка: легенда, камера, twin и маршрут
            </RouterLink>
          </Button>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2 md:hidden">
        <Sheet open={mobileToolsOpen} onOpenChange={setMobileToolsOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              aria-label="Открыть панель сцены, маршрута и twin"
            >
              <FiSliders className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                Панель:{" "}
                {toolsTab === "scene"
                  ? "Сцена"
                  : toolsTab === "route"
                    ? "Маршрут"
                    : "Twin"}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[88vh] overflow-y-auto rounded-t-xl"
          >
            <SheetHeader className="text-left">
              <SheetTitle>Сцена, маршрут и twin</SheetTitle>
              <SheetDescription>
                Вкладка сохраняется в браузере для следующего визита.
              </SheetDescription>
            </SheetHeader>
            <Tabs
              value={toolsTab}
              onValueChange={persistToolsTab}
              className="mt-2 w-full"
            >
              <Warehouse3DToolsPanelContent {...toolsPanelProps} />
            </Tabs>
          </SheetContent>
        </Sheet>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <RouterLink to="/warehouse-3d-help">Справка</RouterLink>
        </Button>
      </div>

      <div className="mb-3 hidden md:block">
        <Tabs
          value={toolsTab}
          onValueChange={persistToolsTab}
          className="w-full"
        >
          <Warehouse3DToolsPanelContent {...toolsPanelProps} />
        </Tabs>
      </div>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
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
                : "min-h-[min(520px,70dvh)] h-[calc(100vh-9.5rem)] rounded-lg md:h-[calc(100vh-12rem)]",
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
                darkMode={resolvedTheme === "dark"}
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
                freeCameraMode={freeCameraMode}
              />
            </Suspense>
          </div>
          <div className="absolute right-2 top-2 flex gap-1.5">
            <Button
              size="icon"
              className="size-9 bg-background/90 shadow-sm backdrop-blur-sm"
              variant="outline"
              onClick={toggleFullscreen}
              title="Полноэкранный режим"
              aria-label="Полноэкранный режим"
            >
              <FiMaximize2 className="size-4" />
            </Button>
            <Button
              size="icon"
              className="size-9 bg-background/90 shadow-sm backdrop-blur-sm"
              variant={freeCameraMode ? "default" : "outline"}
              onClick={() => setFreeCameraMode((f) => !f)}
              title={
                freeCameraMode
                  ? "Включить орбитальную камеру"
                  : "Свободная камера (WASD, стрелки, мышь, колёсико)"
              }
              aria-label={
                freeCameraMode
                  ? "Переключить на орбитальную камеру"
                  : "Свободная камера"
              }
            >
              <FiMove className="size-4" />
            </Button>
            <Button
              size="icon"
              className="size-9 bg-background/90 shadow-sm backdrop-blur-sm"
              variant="outline"
              onClick={() => {
                setFreeCameraMode(false)
                resetCamera()
              }}
              title="Сбросить камеру и выйти из свободного режима"
              aria-label="Сбросить камеру"
            >
              <FiRotateCcw className="size-4" />
            </Button>
          </div>
        </div>
      </ErrorBoundary>

      <p className="mt-2 text-xs text-muted-foreground">
        Подсказки по камере и режимам — в{" "}
        <RouterLink
          to="/warehouse-3d-help"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          справке 3D
        </RouterLink>
        .
      </p>
    </div>
  )
}

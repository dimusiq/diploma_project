import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink, useNavigate } from "@tanstack/react-router"
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
import { equipmentApi } from "@/api/equipment.ts"
import {
  fetchWarehouseLayout,
  fetchWarehouseOccupancy,
  specToLayoutGeometry,
} from "@/api/warehouseLayout.ts"
import { fetchWarehouseRouteGraph } from "@/api/warehouseRouteGraph.ts"
import { warehouseTopologyApi } from "@/api/warehouseTopology.ts"
import type { ItemPublic } from "@/client/index.ts"
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
  cellKeysFromItems,
  getExpiredDays,
  type HeatMetric,
  heatMapForMetric,
  isExpired,
  isExpiringSoon,
  itemsInCell,
  replenishmentNeedByCellKey,
  slaRiskByCellKey,
  stripeByCellKey,
} from "@/components/warehouse3d/twin3dDerived.ts"
import {
  Warehouse3DToolsPanelContent,
  type Warehouse3DToolsTab,
} from "@/components/warehouse3d/Warehouse3dToolsPanels.tsx"
import { WarehouseMiniMap } from "@/components/warehouse3d/WarehouseMiniMap.tsx"
import type {
  CellInfo,
  CellItemInfo,
  TwinOverlayMode,
  WarehouseEquipmentKind,
  WarehouseInteractionMode,
  WarehouseTwinEnrichment,
} from "@/components/warehouse3d/WarehouseScene.tsx"
import {
  cellInfoToSearch,
  clampSearchToLayout,
  parseCellFilter,
  searchToCellInfo,
  validateWarehouse3dSearch,
} from "@/components/warehouse3d/warehouse3dSearch.ts"
import {
  buildWarehouseGeometry,
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
} from "@/components/warehouse3d/warehouseGeometry.tsx"
import { useEquipmentPositionsLive } from "@/hooks/useEquipmentPositionsLive.ts"
import { useTwinLivePanelState } from "@/hooks/useTwinLivePanelState.ts"
import { fetchAllItems, itemsFingerprint } from "@/lib/fetchAllItems.ts"
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

export const Route = createFileRoute("/_layout/warehouse-3d")({
  component: Warehouse3DPage,
  validateSearch: (search) =>
    validateWarehouse3dSearch(search as Record<string, unknown>),
})

function toCellItemInfo(item: ItemPublic): CellItemInfo {
  const expiresAt = item.expires_at ?? null
  const expired = isExpired(expiresAt)
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    quantity: item.quantity ?? 1,
    unit: item.unit ?? null,
    sku: item.sku ?? null,
    expires_at: expiresAt,
    location: item.location ?? null,
    status: item.status,
    expiringSoon: !expired && isExpiringSoon(expiresAt),
    isExpired: expired,
    expiredDays: expired ? getExpiredDays(expiresAt) : undefined,
  }
}

function Warehouse3DPage() {
  const { resolvedTheme } = useTheme()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const skipFocusFromSelfRef = useRef(false)
  const [selectedCell, setSelectedCell] = useState<CellInfo | null>(null)
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
  const lastFingerprintRef = useRef("")
  const [useRouteGraph, setUseRouteGraph] = useState(true)

  const cellFilter = parseCellFilter(search.filter)
  const { status: twinStatus } = useTwinLivePanelState()
  const liveEquipment = useEquipmentPositionsLive()

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

  const { data: layoutApi } = useQuery({
    queryKey: ["warehouse", "layout"],
    queryFn: fetchWarehouseLayout,
    staleTime: 60_000,
  })

  const layoutSpec = useMemo(
    () => specToLayoutGeometry(layoutApi?.spec),
    [layoutApi?.spec],
  )
  const layoutSpecResolved = layoutSpec ?? DEFAULT_WAREHOUSE_LAYOUT_SPEC

  useEffect(() => {
    const clamped = clampSearchToLayout(search, layoutSpecResolved)
    if (
      clamped.row !== search.row ||
      clamped.level !== search.level ||
      clamped.cellX !== search.cellX ||
      clamped.cellZ !== search.cellZ
    ) {
      skipFocusFromSelfRef.current = true
      void navigate({ search: clamped, replace: true })
    }
  }, [layoutSpecResolved, search, navigate])

  useEffect(() => {
    const fromUrl = searchToCellInfo(search, layoutSpecResolved)
    if (fromUrl) {
      setSelectedCell(fromUrl)
      if (!skipFocusFromSelfRef.current) {
        setFocusCell(fromUrl)
      }
    } else if (
      search.row == null &&
      search.level == null &&
      search.cellX == null
    ) {
      setSelectedCell(null)
    }
    skipFocusFromSelfRef.current = false
  }, [
    search.row,
    search.level,
    search.cellX,
    search.cellZ,
    layoutSpecResolved,
  ])

  const persistCellInUrl = useCallback(
    (cell: CellInfo | null) => {
      skipFocusFromSelfRef.current = true
      setSelectedCell(cell)
      void navigate({
        search: cellInfoToSearch(cell, cellFilter),
        replace: true,
      })
    },
    [navigate, cellFilter],
  )

  const setCellFilter = useCallback(
    (filter: typeof cellFilter) => {
      skipFocusFromSelfRef.current = true
      void navigate({
        search: cellInfoToSearch(selectedCell, filter),
        replace: true,
      })
    },
    [navigate, selectedCell],
  )

  useEffect(() => {
    if (!selectedCell) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") persistCellInUrl(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedCell, persistCellInUrl])

  const resetCamera = useCallback(() => setSceneKey((k) => k + 1), [])

  const { data: items = [] } = useQuery({
    queryKey: ["items", "all-for-warehouse-3d"],
    queryFn: () => fetchAllItems(),
    refetchInterval: liveData ? 2500 : false,
    placeholderData: (prev) => prev,
  })

  const { data: occupancy } = useQuery({
    queryKey: ["warehouse", "occupancy"],
    queryFn: fetchWarehouseOccupancy,
    staleTime: 15_000,
    refetchInterval: liveData ? 2500 : false,
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

  const addSelectedCellToRoute = useCallback(() => {
    if (!selectedCell || simulationActive) return
    addRouteWaypoint(selectedCell)
  }, [selectedCell, simulationActive, addRouteWaypoint])

  const setDemoRoute = useCallback(() => {
    if (simulationActive) return
    const spec = layoutSpecResolved
    const endX = Math.max(0, spec.cellX - 1)
    const z = Math.max(0, spec.cellZ - 1)
    setRouteWaypoints([
      { row: 0, level: 0, cellX: 0, cellZ: z, filled: false },
      { row: 0, level: 0, cellX: endX, cellZ: z, filled: false },
    ])
  }, [layoutSpecResolved, simulationActive])

  const itemsRef = useRef(items)
  itemsRef.current = items
  const fingerprint = itemsFingerprint(items)

  useEffect(() => {
    if (items.length === 0) return
    if (lastFingerprintRef.current === fingerprint) return
    const now = Date.now()
    const wait = lastFingerprintRef.current
      ? Math.max(0, 12_000 - (now - snapThrottleRef.current))
      : 0
    const commit = () => {
      lastFingerprintRef.current = itemsFingerprint(itemsRef.current)
      snapThrottleRef.current = Date.now()
      setSnapshots((prev) => [
        ...prev.slice(-35),
        { at: Date.now(), items: [...itemsRef.current] },
      ])
    }
    if (wait === 0) {
      commit()
      return
    }
    const t = window.setTimeout(commit, wait)
    return () => window.clearTimeout(t)
  }, [fingerprint, items.length])

  const displayItems = useMemo(() => {
    if (historyIdx < 0 || historyIdx >= snapshots.length) return items
    return snapshots[historyIdx]?.items ?? items
  }, [items, snapshots, historyIdx])

  useEffect(() => {
    if (historyIdx >= snapshots.length) setHistoryIdx(-1)
  }, [snapshots.length, historyIdx])

  const geom = useMemo(
    () => buildWarehouseGeometry(layoutSpecResolved),
    [layoutSpecResolved],
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

  const viewingHistory = historyIdx >= 0 && historyIdx < snapshots.length

  const twinEnrichment: WarehouseTwinEnrichment | null = useMemo(
    () => ({
      overlayMode,
      topology: topology ?? null,
      routeGraph: routeGraph ?? null,
      equipmentList: equipmentResponse?.data ?? [],
      liveEquipment: viewingHistory ? null : liveEquipment,
      useRouteGraph,
      twinHeatByCellKey,
      twinHazardByCellKey,
      twinLayerVisibility,
    }),
    [
      overlayMode,
      topology,
      routeGraph,
      equipmentResponse?.data,
      liveEquipment,
      viewingHistory,
      useRouteGraph,
      twinHeatByCellKey,
      twinHazardByCellKey,
      twinLayerVisibility,
    ],
  )

  const occupiedCellKeys = useMemo(() => {
    const set = cellKeysFromItems(displayItems)
    if (!viewingHistory) {
      for (const row of occupancy?.data ?? []) {
        if (row.slot_key) set.add(row.slot_key)
      }
    }
    return set
  }, [displayItems, occupancy?.data, viewingHistory])

  const expiringCellKeys = useMemo(
    () =>
      cellKeysFromItems(displayItems, (item) =>
        isExpiringSoon(item.expires_at ?? null),
      ),
    [displayItems],
  )

  const expiredCellKeys = useMemo(
    () =>
      cellKeysFromItems(displayItems, (item) =>
        isExpired(item.expires_at ?? null),
      ),
    [displayItems],
  )

  const selectedItemsForPopup = useMemo((): CellItemInfo[] => {
    if (!selectedCell) return []
    return itemsInCell(displayItems, selectedCell).map(toCellItemInfo)
  }, [selectedCell, displayItems])

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
      setSelectedCell: persistCellInUrl,
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
      cellFilter,
      setCellFilter,
      twinStatus,
      useRouteGraph,
      setUseRouteGraph,
    }),
    [
      liveData,
      interactionMode,
      persistCellInUrl,
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
      cellFilter,
      setCellFilter,
      twinStatus,
      useRouteGraph,
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

      <ErrorBoundary FallbackComponent={ErrorFallback} resetKeys={[sceneKey]}>
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
                onCellSelect={persistCellInUrl}
                occupiedCellKeys={occupiedCellKeys}
                expiringCellKeys={expiringCellKeys}
                expiredCellKeys={expiredCellKeys}
                selectedItems={selectedItemsForPopup}
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
                cellFilter={cellFilter}
              />
            </Suspense>
          </div>
          <WarehouseMiniMap
            geom={geom}
            selectedCell={selectedCell}
            routeWaypoints={routeWaypoints}
            cellFilter={cellFilter}
          />
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

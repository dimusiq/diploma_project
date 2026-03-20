import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Link,
  Text,
} from "@chakra-ui/react"
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
  type ChangeEvent,
} from "react"
import { FiChevronRight, FiMaximize2, FiRotateCcw } from "react-icons/fi"
import { z } from "zod"
import {
  fetchWarehouseLayout,
  specToLayoutGeometry,
} from "@/api/warehouseLayout.ts"
import type { ItemPublic } from "@/client/index.ts"
import { ItemsService } from "@/client/index.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { DEFAULT_WAREHOUSE_LAYOUT_SPEC } from "@/components/warehouse3d/warehouseGeometry.tsx"
import type {
  CellInfo,
  CellItemInfo,
  WarehouseEquipmentKind,
  WarehouseInteractionMode,
} from "@/components/warehouse3d/WarehouseScene.tsx"

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

  const occupiedCellKeys = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => {
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
  }, [items])

  const expiringCellKeys = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => {
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
  }, [items])

  const expiredCellKeys = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => {
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
  }, [items])

  const selectedItem = useMemo(
    () => (selectedCell ? findItemInCell(items, selectedCell) : undefined),
    [selectedCell, items],
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
    <Container maxW="full" py={4}>
      <Flex gap={2} align="center" fontSize="sm" color="gray.600" mb={3}>
        <RouterLink to="/warehouse">
          <Link as="span" color="ui.main" fontWeight="medium">
            Склад
          </Link>
        </RouterLink>
        <Box as={FiChevronRight} fontSize="xs" aria-hidden />
        <Text>Цифровой двойник</Text>
      </Flex>
      <Flex
        justify="space-between"
        align="flex-start"
        wrap="wrap"
        gap={4}
        mb={3}
      >
        <Box>
          <Heading size="lg" mb={2}>
            3D модель склада
          </Heading>
          <Text fontSize="sm" color="gray.600">
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
          </Text>
        </Box>
      </Flex>

      <Flex gap={4} mb={3} flexWrap="wrap" align="center" fontSize="sm">
        <Flex align="center" gap={2}>
          <Box w="3" h="3" borderRadius="sm" bg="#9ca3af" />
          <Text>Пусто</Text>
        </Flex>
        <Flex align="center" gap={2}>
          <Box w="3" h="3" borderRadius="sm" bg="#3b82f6" />
          <Text>Занято</Text>
        </Flex>
        <Flex align="center" gap={2}>
          <Box w="3" h="3" borderRadius="sm" bg="#dc2626" />
          <Text>Срок истекает</Text>
        </Flex>
        <Flex align="center" gap={2}>
          <Box w="3" h="3" borderRadius="sm" bg="#7f1d1d" />
          <Text>Просрочено</Text>
        </Flex>
        <Flex align="center" gap={2}>
          <Box w="3" h="3" borderRadius="sm" bg="#fbbf24" />
          <Text>Выбрано</Text>
        </Flex>
        <Flex align="center" gap={2}>
          <Box w="3" h="3" borderRadius="sm" bg="#ea580c" />
          <Text>Маршрут</Text>
        </Flex>
      </Flex>

      <Box
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        p={4}
        mb={3}
        bg="white"
        minH="108px"
        _dark={{ bg: "gray.900", borderColor: "whiteAlpha.200" }}
      >
        <Text fontWeight="semibold" fontSize="sm" mb={3}>
          Симуляция и маршрут
        </Text>
        <Flex flexWrap="wrap" gap={{ base: 3, md: 4 }} align="flex-start">
          <Flex direction="column" gap={2} minW="200px">
            <Checkbox
              checked={liveData}
              onCheckedChange={(d) => setLiveData(d.checked === true)}
            >
              Доп. опрос списка (~2,5 с) — помимо SSE по всему приложению
            </Checkbox>
            <Checkbox
              checked={interactionMode === "route"}
              onCheckedChange={(d) => {
                const on = d.checked === true
                setInteractionMode(on ? "route" : "view")
                if (on) setSelectedCell(null)
              }}
            >
              Прокладка маршрута (клик по ячейкам по порядку)
            </Checkbox>
            {interactionMode === "route" && (
              <Text fontSize="xs" color="gray.500">
                Попап ячейки в этом режиме отключён; точки — оранжевая линия на
                полу.
              </Text>
            )}
            <Text fontSize="xs" color="gray.500">
              В обычном режиме: <strong>Shift+клик</strong> по ячейке добавляет
              точку маршрута.
            </Text>
          </Flex>
          <Flex direction="column" gap={2} minW="180px">
            <Text fontSize="xs" color="gray.600" fontWeight="medium">
              Техника
            </Text>
            <select
              value={equipmentKind}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setEquipmentKind(e.target.value as WarehouseEquipmentKind)
              }
              style={{
                maxWidth: 220,
                padding: "6px 8px",
                borderRadius: 6,
                borderWidth: 1,
                fontSize: 14,
              }}
            >
              <option value="forklift">Вилочный погрузчик</option>
              <option value="pallet_jack">Рохля (гидравлическая тележка)</option>
            </select>
            <Checkbox
              checked={simulationShowCargo}
              onCheckedChange={(d) =>
                setSimulationShowCargo(d.checked === true)
              }
              disabled={equipmentKind !== "forklift"}
            >
              Показать груз на вилах (погрузчик)
            </Checkbox>
          </Flex>
          <Flex direction="column" gap={2} flex="1" minW="200px">
            <Text fontSize="xs" color="gray.600" fontWeight="medium">
              Скорость симуляции
            </Text>
            <Flex align="center" gap={2}>
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
              <Text fontSize="xs" w="8" color="gray.600">
                {simulationSpeed.toFixed(2)}×
              </Text>
            </Flex>
            <Text fontSize="xs" color="gray.500">
              Точек маршрута: {routeWaypoints.length}
            </Text>
            {routeWaypoints.length < 2 && !simulationActive && (
              <Text fontSize="xs" color="orange.700" maxW="lg">
                Кнопка «Запустить» станет доступна после{" "}
                <strong>двух точек</strong>: «Пример маршрута», дважды «В
                маршрут» (сначала выберите ячейку кликом), режим прокладки или
                Shift+клик по ячейкам.
              </Text>
            )}
            <Flex flexWrap="wrap" gap={2}>
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
                colorPalette="blue"
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
            </Flex>
          </Flex>
        </Flex>
      </Box>

      <Box
        position="relative"
        w="100%"
        ref={canvasContainerRef}
        {...(isFullscreen && {
          w: "100vw",
          h: "100vh",
          minH: "100vh",
          bg: "gray.100",
        })}
      >
        <Box
          w="100%"
          h={isFullscreen ? "100%" : "calc(100vh - 200px)"}
          minH={isFullscreen ? 0 : "480px"}
          borderRadius={isFullscreen ? 0 : "lg"}
          overflow="hidden"
          bg="gray.100"
        >
          <Suspense
            fallback={
              <Flex
                w="100%"
                h="100%"
                align="center"
                justify="center"
                direction="column"
                gap={3}
              >
                <Skeleton w="100%" h="100%" minH="200px" borderRadius="lg" />
                <Text fontSize="sm" color="gray.500">
                  Загрузка 3D…
                </Text>
              </Flex>
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
            />
          </Suspense>
        </Box>
        <Flex position="absolute" top={2} right={2} gap={2}>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            title="Полноэкранный режим"
            aria-label="Полноэкранный режим"
          >
            <Box as={FiMaximize2} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resetCamera}
            title="Вернуть вид по умолчанию"
            aria-label="Сбросить камеру"
          >
            <Flex as="span" gap={2} align="center">
              <Box as={FiRotateCcw} />
              Сбросить камеру
            </Flex>
          </Button>
        </Flex>
      </Box>

      <Text fontSize="xs" color="gray.500" mt={2}>
        Вращение: ЛКМ · Zoom: колёсико · Панорама: ПКМ или Shift+ЛКМ · Клик по
        ячейке — информация (режим просмотра); Shift+клик — точка маршрута ·
        Escape — закрыть окно · Живое обновление подтягивает занятость ячеек с
        сервера без перезагрузки страницы
      </Text>
    </Container>
  )
}

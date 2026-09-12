import type { ItemPublic } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import type { HeatMetric } from "@/components/warehouse3d/twin3dDerived.ts"
import type {
  CellInfo,
  TwinOverlayMode,
  WarehouseEquipmentKind,
  WarehouseInteractionMode,
} from "@/components/warehouse3d/WarehouseScene.tsx"
import type { CellFilter } from "@/components/warehouse3d/warehouse3dSearch.ts"
import type { TwinConnectionStatus } from "@/lib/twinRealtimeBus.ts"

export type Warehouse3DToolsTab = "scene" | "route" | "twin"

export type Warehouse3DToolsPanelContentProps = {
  liveData: boolean
  setLiveData: (v: boolean) => void
  interactionMode: WarehouseInteractionMode
  setInteractionMode: (m: WarehouseInteractionMode) => void
  setSelectedCell: (c: CellInfo | null) => void
  equipmentKind: WarehouseEquipmentKind
  setEquipmentKind: (k: WarehouseEquipmentKind) => void
  simulationShowCargo: boolean
  setSimulationShowCargo: (v: boolean) => void
  simulationSpeed: number
  setSimulationSpeed: (n: number) => void
  routeWaypoints: CellInfo[]
  simulationActive: boolean
  selectedCell: CellInfo | null
  addSelectedCellToRoute: () => void
  setDemoRoute: () => void
  startSimulation: () => void
  stopSimulation: () => void
  popRouteWaypoint: () => void
  clearRoute: () => void
  overlayMode: TwinOverlayMode
  setOverlayMode: (m: TwinOverlayMode) => void
  heatMetric: HeatMetric
  setHeatMetric: (m: HeatMetric) => void
  historyIdx: number
  setHistoryIdx: (n: number) => void
  snapshots: Array<{ at: number; items: ItemPublic[] }>
  cellFilter: CellFilter
  setCellFilter: (f: CellFilter) => void
  twinStatus: TwinConnectionStatus
  useRouteGraph: boolean
  setUseRouteGraph: (v: boolean) => void
}

export function Warehouse3DToolsPanelContent(
  p: Warehouse3DToolsPanelContentProps,
) {
  return (
    <>
      <TabsList className="grid h-9 w-full max-w-lg grid-cols-3">
        <TabsTrigger value="scene" className="text-xs sm:text-sm">
          Сцена
        </TabsTrigger>
        <TabsTrigger value="route" className="text-xs sm:text-sm">
          Маршрут
        </TabsTrigger>
        <TabsTrigger value="twin" className="text-xs sm:text-sm">
          Twin
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="scene"
        className="mt-2 rounded-lg border border-border bg-card p-3"
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Легенда ячеек
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 md:grid-cols-4">
          {(
            [
              ["#9ca3af", "Пусто"],
              ["#3b82f6", "Занято"],
              ["#dc2626", "Срок истекает"],
              ["#7f1d1d", "Просрочено"],
              ["#fbbf24", "Выбрано"],
              ["#ea580c", "Маршрут"],
              ["#a855f7", "Блок / буфер"],
              ["#f59e0b", "Резерв"],
              ["#7c3aed", "Карантин"],
            ] as const
          ).map(([color, label]) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="leading-tight">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Фильтр ячеек
            </p>
            <Select
              value={p.cellFilter}
              onValueChange={(v) => p.setCellFilter(v as CellFilter)}
            >
              <SelectTrigger className="h-9 max-w-[220px] text-sm">
                <SelectValue placeholder="Фильтр" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="empty">Пустые</SelectItem>
                <SelectItem value="occupied">Занятые</SelectItem>
                <SelectItem value="expiring">Срок истекает</SelectItem>
                <SelectItem value="expired">Просрочено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Twin SSE:{" "}
            <span className="font-medium text-foreground">
              {p.twinStatus === "live"
                ? "live"
                : p.twinStatus === "connecting"
                  ? "подключение…"
                  : p.twinStatus === "offline"
                    ? "офлайн"
                    : p.twinStatus === "no_token"
                      ? "нет сессии"
                      : "ожидание"}
            </span>
          </p>
        </div>
      </TabsContent>

      <TabsContent
        value="route"
        className="mt-2 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-start gap-3 md:gap-4">
          <div className="flex min-w-[200px] flex-col gap-2">
            <Checkbox
              checked={p.liveData}
              onCheckedChange={(c) => p.setLiveData(Boolean(c))}
            >
              Опрос списка ~2,5 с (доп. к SSE)
            </Checkbox>
            <Checkbox
              checked={p.interactionMode === "route"}
              onCheckedChange={(c) => {
                const on = Boolean(c)
                p.setInteractionMode(on ? "route" : "view")
                if (on) p.setSelectedCell(null)
              }}
            >
              Режим маршрута: клики по ячейкам по порядку
            </Checkbox>
            {p.interactionMode === "route" && (
              <p className="text-xs text-muted-foreground">
                Попап ячейки отключён; точки — оранжевая линия на полу.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              В обычном режиме: <strong>Shift+клик</strong> — добавить точку.
            </p>
            <Checkbox
              checked={p.useRouteGraph}
              onCheckedChange={(c) => p.setUseRouteGraph(Boolean(c))}
            >
              Маршрут по графу склада (иначе только проходы)
            </Checkbox>
          </div>
          <div className="flex min-w-[180px] flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Техника</p>
            <Select
              value={p.equipmentKind}
              onValueChange={(v) =>
                p.setEquipmentKind(v as WarehouseEquipmentKind)
              }
            >
              <SelectTrigger className="h-9 max-w-[220px] text-sm">
                <SelectValue placeholder="Техника" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forklift">Вилочный погрузчик</SelectItem>
                <SelectItem value="reach_truck">Ричтрак</SelectItem>
                <SelectItem value="pallet_jack">
                  Рохля (гидравлическая тележка)
                </SelectItem>
                <SelectItem value="electric_pallet_jack">
                  Электротележка
                </SelectItem>
                <SelectItem value="order_picker">Комплектовщик</SelectItem>
              </SelectContent>
            </Select>
            <Checkbox
              checked={p.simulationShowCargo}
              onCheckedChange={(c) => p.setSimulationShowCargo(Boolean(c))}
              disabled={
                p.equipmentKind !== "forklift" &&
                p.equipmentKind !== "reach_truck"
              }
            >
              Груз на вилах
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
                value={p.simulationSpeed}
                onChange={(e) =>
                  p.setSimulationSpeed(Number.parseFloat(e.target.value))
                }
                style={{ flex: 1, maxWidth: 200 }}
                aria-label="Скорость симуляции"
              />
              <span className="w-8 text-xs text-muted-foreground">
                {p.simulationSpeed.toFixed(2)}×
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Точек: {p.routeWaypoints.length}
              {p.routeWaypoints.length < 2 && !p.simulationActive && (
                <span className="text-orange-700 dark:text-orange-400">
                  {" "}
                  — нужно ≥2 для «Запустить»
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={p.addSelectedCellToRoute}
                disabled={!p.selectedCell || p.simulationActive}
              >
                В маршрут
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={p.setDemoRoute}
                disabled={p.simulationActive}
              >
                Пример (2 точки)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={p.startSimulation}
                disabled={p.routeWaypoints.length < 2 || p.simulationActive}
              >
                Запустить
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={p.stopSimulation}
                disabled={!p.simulationActive}
              >
                Стоп
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={p.popRouteWaypoint}
                disabled={p.routeWaypoints.length === 0 || p.simulationActive}
              >
                − точка
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={p.clearRoute}
                disabled={
                  p.routeWaypoints.length === 0 && !p.simulationActive
                }
              >
                Сброс
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent
        value="twin"
        className="mt-2 rounded-lg border border-border bg-card p-4"
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Оверлеи на сцене: зоны, heatmap, SLA. Снимки — локально в браузере.
        </p>
        <div className="flex flex-wrap items-end gap-3 md:gap-4">
          <div className="min-w-[200px]">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Режим наложения
            </p>
            <Select
              value={p.overlayMode}
              onValueChange={(v) => p.setOverlayMode(v as TwinOverlayMode)}
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
          {p.overlayMode === "workload" && (
            <div className="min-w-[180px]">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Метрика heatmap
              </p>
              <Select
                value={p.heatMetric}
                onValueChange={(v) => p.setHeatMetric(v as HeatMetric)}
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
              max={Math.max(-1, p.snapshots.length - 1)}
              step={1}
              value={p.historyIdx}
              onChange={(e) => p.setHistoryIdx(Number(e.target.value))}
              disabled={p.snapshots.length === 0}
              aria-label="Снимок состояния товаров"
              style={{ width: "100%", maxWidth: 360 }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {p.historyIdx < 0 || p.snapshots.length === 0
                ? "Текущие данные с сервера"
                : `Снимок: ${new Date(p.snapshots[p.historyIdx]!.at).toLocaleString("ru-RU")}`}
            </p>
          </div>
        </div>
      </TabsContent>
    </>
  )
}

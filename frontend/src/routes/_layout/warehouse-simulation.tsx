import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts"
import {
  fetchKpiSnapshot,
  fetchSimulationScenarios,
  fetchWarehousesForSimulationSeed,
  type PutawayRule,
  postSimulationRun,
  postSimulationScenario,
  postSimulationScenarioRun,
  type SimulationRunBody,
} from "@/api/warehouseSimulation.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

export const Route = createFileRoute("/_layout/warehouse-simulation")({
  component: WarehouseSimulationPage,
})

function num(v: string, fallback: number): number {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

const KPI_META: {
  key: string
  label: string
  lowerIsBetter: boolean
  isRatio: boolean
}[] = [
  { key: "max_dock_queue", label: "Макс. очередь у доков", lowerIsBetter: true, isRatio: false },
  { key: "max_putaway_queue", label: "Макс. очередь размещения", lowerIsBetter: true, isRatio: false },
  { key: "max_pick_queue", label: "Макс. очередь отбора", lowerIsBetter: true, isRatio: false },
  { key: "mean_dock_turnaround_min", label: "Оборот у дока, мин", lowerIsBetter: true, isRatio: false },
  { key: "mean_inbound_dwell_min", label: "Вход → размещено, мин", lowerIsBetter: true, isRatio: false },
  { key: "mean_pick_wait_min", label: "Ожидание отбора, мин", lowerIsBetter: true, isRatio: false },
  { key: "mean_pick_path_proxy_min", label: "Путь отбора, мин", lowerIsBetter: true, isRatio: false },
  { key: "mean_replenishment_cycle_min", label: "Цикл пополнения, мин", lowerIsBetter: true, isRatio: false },
  { key: "forklift_utilization", label: "Загрузка погрузчиков", lowerIsBetter: false, isRatio: true },
  { key: "operator_utilization", label: "Загрузка операторов", lowerIsBetter: false, isRatio: true },
  { key: "dock_utilization", label: "Загрузка доков", lowerIsBetter: false, isRatio: true },
  { key: "otif_proxy", label: "OTIF (своевременность)", lowerIsBetter: false, isRatio: true },
  { key: "late_pick_fraction", label: "Доля опоздавших отборов", lowerIsBetter: true, isRatio: true },
]

function normalizeForRadar(
  v1: number,
  v2: number,
  lowerIsBetter: boolean,
): [number, number] {
  if (v1 === v2) return [65, 65]
  const minV = Math.min(v1, v2)
  const maxV = Math.max(v1, v2)
  const range = maxV - minV
  const scale = (v: number) => 30 + 70 * ((v - minV) / range)
  if (lowerIsBetter) return [130 - scale(v1), 130 - scale(v2)]
  return [scale(v1), scale(v2)]
}

function WarehouseSimulationPage() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [duration, setDuration] = useState("48")
  const [seed, setSeed] = useState("42")
  const [docks, setDocks] = useState("2")
  const [forklifts, setForklifts] = useState("3")
  const [operators, setOperators] = useState("5")
  const [travelScale, setTravelScale] = useState("1")
  const [putawayRule, setPutawayRule] = useState<PutawayRule>("nearest")
  const [sandboxPutawayExtra, setSandboxPutawayExtra] = useState("0")
  const [scenarioName, setScenarioName] = useState("")
  const [seedFromTwin, setSeedFromTwin] = useState(false)
  const [simWarehouseId, setSimWarehouseId] = useState("")

  const snapQ = useQuery({
    queryKey: ["warehouse-simulation-kpi-snapshot"],
    queryFn: fetchKpiSnapshot,
  })

  const whSeedQ = useQuery({
    queryKey: ["warehouses-for-simulation-seed"],
    queryFn: fetchWarehousesForSimulationSeed,
  })

  const buildRunBody = (): SimulationRunBody => {
    const body: SimulationRunBody = {
      duration_hours: num(duration, 48),
      seed: Math.floor(num(seed, 42)),
      dock_bays: Math.floor(num(docks, 2)),
      num_forklifts: Math.floor(num(forklifts, 3)),
      num_operators: Math.floor(num(operators, 5)),
      layout_travel_scale: num(travelScale, 1),
      putaway_rule: putawayRule,
      sandbox_extra_putaway_min: num(sandboxPutawayExtra, 0),
    }
    if (seedFromTwin) {
      body.seed_from_twin = true
      if (simWarehouseId.trim()) {
        body.warehouse_id = simWarehouseId.trim()
      }
    }
    return body
  }

  const runMut = useMutation({
    mutationFn: () => postSimulationRun(buildRunBody()),
    onError: (e: Error) => showErrorToast(e.message),
  })

  const scenariosQ = useQuery({
    queryKey: ["simulation-scenarios"],
    queryFn: fetchSimulationScenarios,
  })

  const saveScenarioMut = useMutation({
    mutationFn: () => {
      const name = scenarioName.trim()
      if (!name) throw new Error("Укажите название сценария")
      return postSimulationScenario({ name, config: buildRunBody() })
    },
    onSuccess: () => {
      showSuccessToast("Сценарий сохранён")
      void scenariosQ.refetch()
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const runSavedMut = useMutation({
    mutationFn: (id: string) =>
      postSimulationScenarioRun(id, {
        seed_from_twin: seedFromTwin,
        ...(seedFromTwin && simWarehouseId.trim()
          ? { warehouse_id: simWarehouseId.trim() }
          : {}),
      }),
    onSuccess: () => {
      showSuccessToast("Прогон по сохранённому сценарию выполнен")
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const twin = snapQ.data?.twin_summary as
    | {
        warehouse_items_total?: number
        occupied_slots?: number
        slot_utilization_ratio?: number | null
        items_expiring_within_30_days?: number
      }
    | undefined

  const lastSimResult = runMut.data ?? runSavedMut.data
  const k = lastSimResult?.kpis
  const isSimulating = runMut.isPending || runSavedMut.isPending

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold tracking-tight">
        Симуляция и аналитика
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Снимок показателей из базы: занятость по зонам, рядам и уровням ячеек,
        среднее время нахождения на складе, сроки годности, оценка точности
        запасов по событиям. Дискретно-событийная модель прогнозирует очереди,
        работу доков, отбор, пополнение и загрузку ресурсов до изменения
        планировки или правил.
      </p>

      <h2 className="font-heading mb-3 text-sm font-semibold">
        Снимок показателей (база данных)
      </h2>
      {snapQ.isPending && <Skeleton className="mb-8 h-[120px]" />}
      {snapQ.isError && (
        <p className="mb-8 text-sm text-destructive">
          Не удалось загрузить снимок.
        </p>
      )}
      {snapQ.data && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <StatCard
            label="Товаров на складе"
            value={String(twin?.warehouse_items_total ?? "—")}
          />
          <StatCard
            label="Занято ячеек"
            value={String(twin?.occupied_slots ?? "—")}
          />
          <StatCard
            label="Заполнение ячеек"
            value={
              twin?.slot_utilization_ratio != null
                ? `${(twin.slot_utilization_ratio * 100).toFixed(1)}%`
                : "—"
            }
          />
          <StatCard
            label="Истекает за 30 дн."
            value={String(twin?.items_expiring_within_30_days ?? "—")}
          />
          <StatCard
            label="Среднее время на складе, сут."
            value={
              snapQ.data.mean_dwell_days_warehouse != null
                ? String(snapQ.data.mean_dwell_days_warehouse)
                : "—"
            }
          />
          <StatCard
            label="Доля с близким сроком годности"
            value={
              snapQ.data.near_expiry_ratio != null
                ? `${(snapQ.data.near_expiry_ratio * 100).toFixed(2)}%`
                : "—"
            }
          />
          <StatCard
            label="Точность запасов (оценка)"
            value={
              snapQ.data.stock_accuracy_proxy != null
                ? `${(snapQ.data.stock_accuracy_proxy * 100).toFixed(1)}%`
                : "нет данных"
            }
          />
        </div>
      )}

      {snapQ.data && snapQ.data.occupancy_by_zone.length > 0 && (
        <Card className="mb-8 bg-muted/30 ring-foreground/5">
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-heading text-sm font-semibold">
              Занятость по зонам
            </h2>
            <div className="flex flex-col gap-1 text-sm">
              {snapQ.data.occupancy_by_zone.map((z) => (
                <div key={z.zone_name} className="flex justify-between gap-2">
                  <span>{z.zone_name}</span>
                  <span className="font-medium">{z.item_count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {snapQ.data && snapQ.data.occupancy_by_slot_level.length > 0 && (
        <Card className="mb-8 bg-muted/30 ring-foreground/5">
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-heading text-sm font-semibold">
              По уровню ячейки (тип слота — условно)
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Уровень 1 — зона отбора; остальные уровни — резервное хранение.
            </p>
            <div className="flex flex-col gap-1 text-sm">
              {snapQ.data.occupancy_by_slot_level.map((s) => (
                <div
                  key={`${s.storage_level}-${s.slot_kind}`}
                  className="flex justify-between gap-2"
                >
                  <span>
                    Уровень {s.storage_level} (
                    {s.slot_kind === "pick_face"
                      ? "отбор"
                      : s.slot_kind === "reserve"
                        ? "резерв"
                        : s.slot_kind}
                    )
                  </span>
                  <span className="font-medium">{s.item_count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <h2 className="font-heading mb-3 text-sm font-semibold">
        Модель «что если» (дискретно-событийная)
      </h2>
      <div className="relative">
      {isSimulating && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 rounded-lg bg-background/80 backdrop-blur-sm">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <div className="text-center">
            <p className="text-lg font-semibold">Расчёт модели…</p>
            <p className="text-sm text-muted-foreground">Симуляция может занять несколько секунд</p>
          </div>
        </div>
      )}
      <Card className="mb-6 bg-muted/30 ring-foreground/5">
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            «Масштаб пути» отражает удлинение маршрутов при усложнении
            планировки; дополнительные минуты размещения имитируют перестановки
            в песочнице (дольше уходит размещение). Старт из twin подставляет
            глубины очередей из проекций (имена очередей: dock*, pick*, putaway*
            / staging).
          </p>
          <div className="mb-4 flex flex-col gap-3">
            <Checkbox
              checked={seedFromTwin}
              onCheckedChange={(c) => setSeedFromTwin(c)}
            >
              Стартовать сценарий из актуального twin (очереди док / размещение
              / отбор)
            </Checkbox>
            {seedFromTwin && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Склад для чтения очередей (пусто — первый склад в системе)
                </p>
                {whSeedQ.isPending ? (
                  <Skeleton className="h-8 max-w-[320px]" />
                ) : whSeedQ.isError ? (
                  <p className="text-xs text-destructive">
                    Не удалось загрузить список складов.
                  </p>
                ) : (
                  <Select
                    value={toSelectAll(simWarehouseId)}
                    onValueChange={(v) => setSimWarehouseId(fromSelectAll(v))}
                  >
                    <SelectTrigger className="h-8 w-full max-w-[320px] text-sm">
                      <SelectValue placeholder="Склад" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_ALL_VALUE}>
                        По умолчанию
                      </SelectItem>
                      {(whSeedQ.data ?? []).map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Длительность, ч">
              <Input
                className="h-7 w-[90px] text-sm"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field label="Зерно случайности">
              <Input
                className="h-7 w-20 text-sm"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </Field>
            <Field label="Мест у дока">
              <Input
                className="h-7 w-[70px] text-sm"
                value={docks}
                onChange={(e) => setDocks(e.target.value)}
              />
            </Field>
            <Field label="Погрузчики">
              <Input
                className="h-7 w-[90px] text-sm"
                value={forklifts}
                onChange={(e) => setForklifts(e.target.value)}
              />
            </Field>
            <Field label="Операторы">
              <Input
                className="h-7 w-[90px] text-sm"
                value={operators}
                onChange={(e) => setOperators(e.target.value)}
              />
            </Field>
            <Field label="Масштаб пути">
              <Input
                className="h-7 w-[90px] text-sm"
                value={travelScale}
                onChange={(e) => setTravelScale(e.target.value)}
              />
            </Field>
            <Field label="Доп. время размещения, мин">
              <Input
                className="h-7 w-[100px] text-sm"
                value={sandboxPutawayExtra}
                onChange={(e) => setSandboxPutawayExtra(e.target.value)}
              />
            </Field>
            <div>
              <p className="mb-1 text-xs">Правило размещения</p>
              <Select
                value={putawayRule}
                onValueChange={(v) => setPutawayRule(v as PutawayRule)}
              >
                <SelectTrigger className="h-8 w-[200px] text-sm">
                  <SelectValue placeholder="Правило" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nearest">Ближайшая ячейка</SelectItem>
                  <SelectItem value="round_robin">По кругу</SelectItem>
                  <SelectItem value="random">Случайно</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isSimulating}
              loading={runMut.isPending}
              onClick={() => runMut.mutate()}
            >
              {runMut.isPending ? "Вычисляем…" : "Запустить симуляцию"}
            </Button>
            <Field label="Имя сценария">
              <Input
                className="h-7 w-[200px] text-sm"
                placeholder="Сохранить параметры"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            </Field>
            <Button
              size="sm"
              variant="outline"
              loading={saveScenarioMut.isPending}
              onClick={() => saveScenarioMut.mutate()}
            >
              Сохранить сценарий
            </Button>
          </div>
        </CardContent>
      </Card>

      <h2 className="font-heading mb-3 mt-4 text-sm font-semibold">
        Сохранённые сценарии
      </h2>
      <Card className="mb-8 bg-muted/30 ring-foreground/5">
        <CardContent className="pt-6">
          {scenariosQ.isPending ? (
            <Skeleton className="h-20" />
          ) : scenariosQ.isError ? (
            <p className="text-sm text-muted-foreground">
              Не удалось загрузить список (нужна авторизация).
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {(scenariosQ.data?.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Пока нет сохранённых сценариев.
                </p>
              ) : (
                (scenariosQ.data?.data ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium">{s.name}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isSimulating}
                      loading={runSavedMut.isPending}
                      onClick={() => runSavedMut.mutate(s.id)}
                    >
                      {runSavedMut.isPending ? "Вычисляем…" : "Прогнать"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ScenarioComparisonSection
        scenarios={scenariosQ.data?.data ?? []}
      />

      {k && (
        <>
          <h2 className="font-heading mb-3 mt-2 text-sm font-semibold">
            Результаты симуляции
          </h2>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <StatCard
              label="Макс. очередь у доков"
              value={String(k.max_dock_queue)}
            />
            <StatCard
              label="Макс. очередь размещения"
              value={String(k.max_putaway_queue)}
            />
            <StatCard
              label="Макс. очередь отбора"
              value={String(k.max_pick_queue)}
            />
            <StatCard
              label="Время оборота у дока, мин"
              value={fmt(k.mean_dock_turnaround_min)}
            />
            <StatCard
              label="Время «вход → размещено» (модель), мин"
              value={fmt(k.mean_inbound_dwell_min)}
            />
            <StatCard
              label="Ожидание отбора, мин"
              value={fmt(k.mean_pick_wait_min)}
            />
            <StatCard
              label="Прокси длины пути отбора, мин"
              value={fmt(k.mean_pick_path_proxy_min)}
            />
            <StatCard
              label="Длительность цикла пополнения, мин"
              value={fmt(k.mean_replenishment_cycle_min)}
            />
            <StatCard
              label="Загрузка погрузчиков"
              value={pct(k.forklift_utilization)}
            />
            <StatCard
              label="Загрузка операторов"
              value={pct(k.operator_utilization)}
            />
            <StatCard label="Загрузка доков" value={pct(k.dock_utilization)} />
            <StatCard
              label="Прокси своевременности (OTIF)"
              value={pct(k.otif_proxy)}
            />
            <StatCard
              label="Доля отборов с опозданием"
              value={pct(k.late_pick_fraction)}
            />
            <StatCard
              label="Обработано событий модели"
              value={String(k.events_processed)}
            />
          </div>
          {lastSimResult?.twin_initial_state != null &&
            typeof lastSimResult.twin_initial_state === "object" && (
              <Card className="mb-8 ring-foreground/15">
                <CardContent className="pt-6">
                  <h2 className="font-heading mb-2 text-sm font-semibold">
                    Стартовое состояние из twin
                  </h2>
                  <TwinInitialStateView
                    state={lastSimResult.twin_initial_state}
                  />
                </CardContent>
              </Card>
            )}
        </>
      )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs">{label}</p>
      {children}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3 pt-6">
        <p className="mb-1 text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function fmt(v: number | null): string {
  return v != null ? String(v) : "—"
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function ScenarioComparisonSection({
  scenarios,
}: {
  scenarios: Array<{
    id: string
    name: string
    baseline_kpis: Record<string, unknown> | null
  }>
}) {
  const [open, setOpen] = useState(false)
  const [idA, setIdA] = useState("")
  const [idB, setIdB] = useState("")

  const completed = useMemo(
    () => scenarios.filter((s) => s.baseline_kpis != null),
    [scenarios],
  )

  const scenarioA = completed.find((s) => s.id === idA)
  const scenarioB = completed.find((s) => s.id === idB)
  const kpisA = scenarioA?.baseline_kpis ?? null
  const kpisB = scenarioB?.baseline_kpis ?? null
  const nameA = scenarioA?.name ?? "A"
  const nameB = scenarioB?.name ?? "B"

  const radarData = useMemo(() => {
    if (!kpisA || !kpisB) return []
    return KPI_META.map((m) => {
      const vA = Number(kpisA[m.key] ?? 0) || 0
      const vB = Number(kpisB[m.key] ?? 0) || 0
      const [nA, nB] = normalizeForRadar(vA, vB, m.lowerIsBetter)
      return { metric: m.label, scenarioA: nA, scenarioB: nB }
    })
  }, [kpisA, kpisB])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <h2 className="font-heading mb-3 mt-4 text-sm font-semibold">
        <CollapsibleTrigger className="flex items-center gap-1.5 hover:underline">
          <span
            className="inline-block text-xs transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
          Сравнить сценарии
        </CollapsibleTrigger>
      </h2>

      <CollapsibleContent>
          {completed.length < 2 ? (
            <p className="mb-6 text-sm text-muted-foreground">
              Нужно минимум 2 сценария с сохранёнными KPI (baseline). Запустите
              прогон по сохранённому сценарию и сохраните baseline-результаты.
            </p>
          ) : (
            <Card className="mb-8 bg-muted/30 ring-foreground/5">
              <CardContent className="pt-6">
                <div className="mb-4 flex flex-wrap gap-4">
                  <Field label="Сценарий A">
                    <Select
                      value={toSelectAll(idA)}
                      onValueChange={(v) => setIdA(fromSelectAll(v))}
                    >
                      <SelectTrigger className="h-8 w-[260px] text-sm">
                        <SelectValue placeholder="Выберите сценарий" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_ALL_VALUE}>—</SelectItem>
                        {completed.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            disabled={s.id === idB}
                          >
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Сценарий B">
                    <Select
                      value={toSelectAll(idB)}
                      onValueChange={(v) => setIdB(fromSelectAll(v))}
                    >
                      <SelectTrigger className="h-8 w-[260px] text-sm">
                        <SelectValue placeholder="Выберите сценарий" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_ALL_VALUE}>—</SelectItem>
                        {completed.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            disabled={s.id === idA}
                          >
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {kpisA && kpisB && (
                  <div className="space-y-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pr-4">Показатель</th>
                            <th className="py-2 pr-4 text-right">{nameA}</th>
                            <th className="py-2 pr-4 text-right">{nameB}</th>
                            <th className="py-2 pr-4 text-right">Δ</th>
                            <th className="py-2 text-right">Δ %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {KPI_META.map((m) => {
                            const vA = Number(kpisA[m.key] ?? 0) || 0
                            const vB = Number(kpisB[m.key] ?? 0) || 0
                            const delta = vB - vA
                            const deltaPct =
                              vA !== 0 ? (delta / Math.abs(vA)) * 100 : 0
                            const improved = m.lowerIsBetter
                              ? delta < 0
                              : delta > 0
                            const degraded = m.lowerIsBetter
                              ? delta > 0
                              : delta < 0
                            const colorClass =
                              delta === 0
                                ? "text-muted-foreground"
                                : improved
                                  ? "text-green-600 dark:text-green-400"
                                  : degraded
                                    ? "text-red-600 dark:text-red-400"
                                    : ""
                            const fmtVal = (v: number) =>
                              m.isRatio ? pct(v) : fmt(v)
                            const deltaStr = m.isRatio
                              ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`
                              : `${delta > 0 ? "+" : ""}${Number.isInteger(delta) ? delta : delta.toFixed(2)}`
                            return (
                              <tr
                                key={m.key}
                                className="border-b last:border-b-0"
                              >
                                <td className="py-1.5 pr-4 font-medium">
                                  {m.label}
                                </td>
                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                  {fmtVal(vA)}
                                </td>
                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                  {fmtVal(vB)}
                                </td>
                                <td
                                  className={`py-1.5 pr-4 text-right tabular-nums ${colorClass}`}
                                >
                                  {deltaStr}
                                </td>
                                <td
                                  className={`py-1.5 text-right tabular-nums ${colorClass}`}
                                >
                                  {delta === 0
                                    ? "—"
                                    : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mx-auto w-full max-w-lg">
                      <p className="mb-2 text-center text-xs text-muted-foreground">
                        Радар-профиль (нормализовано 0–100, выше = лучше)
                      </p>
                      <ResponsiveContainer width="100%" height={380}>
                        <RadarChart data={radarData} outerRadius="72%">
                          <PolarGrid />
                          <PolarAngleAxis
                            dataKey="metric"
                            tick={{ fontSize: 10 }}
                          />
                          <PolarRadiusAxis
                            angle={90}
                            domain={[0, 100]}
                            tick={false}
                            axisLine={false}
                          />
                          <Radar
                            name={nameA}
                            dataKey="scenarioA"
                            stroke="hsl(210 80% 55%)"
                            fill="hsl(210 80% 55%)"
                            fillOpacity={0.15}
                          />
                          <Radar
                            name={nameB}
                            dataKey="scenarioB"
                            stroke="hsl(340 75% 55%)"
                            fill="hsl(340 75% 55%)"
                            fillOpacity={0.15}
                          />
                          <Legend />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function TwinInitialStateView({ state }: { state: Record<string, unknown> }) {
  const wh =
    typeof state.warehouse_code === "string"
      ? state.warehouse_code
      : state.warehouse_id
  const dock = state.initial_dock_queue
  const put = state.initial_putaway_queue
  const pick = state.initial_pick_queue
  const rows = state.queue_projection_rows
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        Склад: <strong className="text-foreground">{String(wh ?? "—")}</strong>
      </p>
      <p>
        Начальные очереди DES: док {String(dock ?? "—")}, размещение{" "}
        {String(put ?? "—")}, отбор {String(pick ?? "—")}
      </p>
      {Array.isArray(rows) && rows.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Строки проекции</p>
          <div className="flex flex-col gap-0.5 text-xs">
            {rows.slice(0, 24).map((r, i) => (
              <p key={i}>
                {String((r as { queue_name?: string }).queue_name ?? "?")}:
                depth {String((r as { depth?: number }).depth ?? "?")} (
                {String((r as { category?: string | null }).category ?? "—")})
              </p>
            ))}
            {rows.length > 24 && (
              <p className="text-muted-foreground">… ещё {rows.length - 24}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Input,
  SimpleGrid,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ChangeEvent, ReactNode } from "react"
import { useState } from "react"
import {
  type PutawayRule,
  type SimulationRunBody,
  fetchKpiSnapshot,
  fetchSimulationScenarios,
  fetchWarehousesForSimulationSeed,
  postSimulationRun,
  postSimulationScenario,
  postSimulationScenarioRun,
} from "@/api/warehouseSimulation.ts"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

export const Route = createFileRoute("/_layout/warehouse-simulation")({
  component: WarehouseSimulationPage,
})

function num(v: string, fallback: number): number {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : fallback
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

  return (
    <Container maxW="6xl" py={{ base: 6, md: 10 }}>
      <Heading size="lg" mb={2}>
        Симуляция и аналитика
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={8}>
        Снимок показателей из базы: занятость по зонам, рядам и уровням ячеек,
        среднее время нахождения на складе, сроки годности, оценка точности
        запасов по событиям. Дискретно-событийная модель прогнозирует очереди,
        работу доков, отбор, пополнение и загрузку ресурсов до изменения планировки
        или правил.
      </Text>

      <Heading size="sm" mb={3}>
        Снимок показателей (база данных)
      </Heading>
      {snapQ.isPending && <Skeleton h="120px" mb={8} />}
      {snapQ.isError && (
        <Text color="red.fg" mb={8}>
          Не удалось загрузить снимок.
        </Text>
      )}
      {snapQ.data && (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap={4} mb={8}>
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
        </SimpleGrid>
      )}

      {snapQ.data && snapQ.data.occupancy_by_zone.length > 0 && (
        <Card.Root mb={8} variant="subtle">
          <Card.Body>
            <Heading size="sm" mb={2}>
              Занятость по зонам
            </Heading>
            <Flex direction="column" gap={1} fontSize="sm">
              {snapQ.data.occupancy_by_zone.map((z) => (
                <Flex key={z.zone_name} justify="space-between">
                  <Text>{z.zone_name}</Text>
                  <Text fontWeight="medium">{z.item_count}</Text>
                </Flex>
              ))}
            </Flex>
          </Card.Body>
        </Card.Root>
      )}

      {snapQ.data && snapQ.data.occupancy_by_slot_level.length > 0 && (
        <Card.Root mb={8} variant="subtle">
          <Card.Body>
            <Heading size="sm" mb={2}>
              По уровню ячейки (тип слота — условно)
            </Heading>
            <Text fontSize="xs" color="fg.muted" mb={2}>
              Уровень 1 — зона отбора; остальные уровни — резервное хранение.
            </Text>
            <Flex direction="column" gap={1} fontSize="sm">
              {snapQ.data.occupancy_by_slot_level.map((s) => (
                <Flex key={s.storage_level} justify="space-between">
                  <Text>
                    Уровень {s.storage_level} (
                    {s.slot_kind === "pick_face"
                      ? "отбор"
                      : s.slot_kind === "reserve"
                        ? "резерв"
                        : s.slot_kind}
                    )
                  </Text>
                  <Text fontWeight="medium">{s.item_count}</Text>
                </Flex>
              ))}
            </Flex>
          </Card.Body>
        </Card.Root>
      )}

      <Heading size="sm" mb={3}>
        Модель «что если» (дискретно-событийная)
      </Heading>
      <Card.Root mb={6} variant="subtle">
        <Card.Body>
          <Text fontSize="sm" color="fg.muted" mb={4}>
            «Масштаб пути» отражает удлинение маршрутов при усложнении планировки;
            дополнительные минуты размещения имитируют перестановки в песочнице
            (дольше уходит размещение). Старт из twin подставляет глубины очередей
            из проекций (имена очередей: dock*, pick*, putaway* / staging).
          </Text>
          <Flex direction="column" gap={3} mb={4}>
            <Checkbox
              checked={seedFromTwin}
              onCheckedChange={(d) => setSeedFromTwin(d.checked === true)}
            >
              Стартовать сценарий из актуального twin (очереди док / размещение /
              отбор)
            </Checkbox>
            {seedFromTwin && (
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>
                  Склад для чтения очередей (пусто — первый склад в системе)
                </Text>
                {whSeedQ.isPending ? (
                  <Skeleton h="32px" maxW="320px" />
                ) : whSeedQ.isError ? (
                  <Text fontSize="xs" color="red.fg">
                    Не удалось загрузить список складов.
                  </Text>
                ) : (
                  <select
                    value={simWarehouseId}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setSimWarehouseId(e.target.value)
                    }
                    style={{
                      maxWidth: 320,
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid",
                      fontSize: 14,
                    }}
                  >
                    <option value="">По умолчанию</option>
                    {(whSeedQ.data ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                )}
              </Box>
            )}
          </Flex>
          <Flex gap={3} align="flex-end" flexWrap="wrap">
            <Field label="Длительность, ч">
              <Input
                size="sm"
                w="90px"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field label="Зерно случайности">
              <Input
                size="sm"
                w="80px"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </Field>
            <Field label="Мест у дока">
              <Input
                size="sm"
                w="70px"
                value={docks}
                onChange={(e) => setDocks(e.target.value)}
              />
            </Field>
            <Field label="Погрузчики">
              <Input
                size="sm"
                w="90px"
                value={forklifts}
                onChange={(e) => setForklifts(e.target.value)}
              />
            </Field>
            <Field label="Операторы">
              <Input
                size="sm"
                w="90px"
                value={operators}
                onChange={(e) => setOperators(e.target.value)}
              />
            </Field>
            <Field label="Масштаб пути">
              <Input
                size="sm"
                w="90px"
                value={travelScale}
                onChange={(e) => setTravelScale(e.target.value)}
              />
            </Field>
            <Field label="Доп. время размещения, мин">
              <Input
                size="sm"
                w="100px"
                value={sandboxPutawayExtra}
                onChange={(e) => setSandboxPutawayExtra(e.target.value)}
              />
            </Field>
            <Box>
              <Text fontSize="xs" mb={1}>
                Правило размещения
              </Text>
              <select
                value={putawayRule}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setPutawayRule(e.target.value as PutawayRule)
                }
                style={{
                  width: 200,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid",
                  fontSize: 14,
                }}
              >
                <option value="nearest">Ближайшая ячейка</option>
                <option value="round_robin">По кругу</option>
                <option value="random">Случайно</option>
              </select>
            </Box>
            <Button
              size="sm"
              loading={runMut.isPending}
              onClick={() => runMut.mutate()}
            >
              Запустить симуляцию
            </Button>
            <Field label="Имя сценария">
              <Input
                size="sm"
                w="200px"
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
          </Flex>
        </Card.Body>
      </Card.Root>

      <Heading size="sm" mb={3} mt={4}>
        Сохранённые сценарии
      </Heading>
      <Card.Root mb={8} variant="subtle">
        <Card.Body>
          {scenariosQ.isPending ? (
            <Skeleton h="80px" />
          ) : scenariosQ.isError ? (
            <Text fontSize="sm" color="fg.muted">
              Не удалось загрузить список (нужна авторизация).
            </Text>
          ) : (
            <Flex direction="column" gap={2}>
              {(scenariosQ.data?.data ?? []).length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  Пока нет сохранённых сценариев.
                </Text>
              ) : (
                (scenariosQ.data?.data ?? []).map((s) => (
                  <Flex
                    key={s.id}
                    justify="space-between"
                    align="center"
                    flexWrap="wrap"
                    gap={2}
                  >
                    <Text fontSize="sm" fontWeight="medium">
                      {s.name}
                    </Text>
                    <Button
                      size="xs"
                      loading={runSavedMut.isPending}
                      onClick={() => runSavedMut.mutate(s.id)}
                    >
                      Прогнать
                    </Button>
                  </Flex>
                ))
              )}
            </Flex>
          )}
        </Card.Body>
      </Card.Root>

      {k && (
        <>
          <Heading size="sm" mb={3} mt={2}>
            Результаты симуляции
          </Heading>
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4} mb={8}>
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
        </SimpleGrid>
        {lastSimResult?.twin_initial_state != null &&
          typeof lastSimResult.twin_initial_state === "object" && (
            <Card.Root mb={8} variant="outline">
              <Card.Body>
                <Heading size="sm" mb={2}>
                  Стартовое состояние из twin
                </Heading>
                <TwinInitialStateView state={lastSimResult.twin_initial_state} />
              </Card.Body>
            </Card.Root>
          )}
        </>
      )}
    </Container>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text fontSize="xs" mb={1}>
        {label}
      </Text>
      {children}
    </Box>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card.Root variant="outline">
      <Card.Body py={3}>
        <Text fontSize="xs" color="fg.muted" mb={1}>
          {label}
        </Text>
        <Text fontSize="lg" fontWeight="semibold">
          {value}
        </Text>
      </Card.Body>
    </Card.Root>
  )
}

function fmt(v: number | null): string {
  return v != null ? String(v) : "—"
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
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
    <Flex direction="column" gap={2} fontSize="sm">
      <Text color="fg.muted">
        Склад: <strong>{String(wh ?? "—")}</strong>
      </Text>
      <Text>
        Начальные очереди DES: док {String(dock ?? "—")}, размещение{" "}
        {String(put ?? "—")}, отбор {String(pick ?? "—")}
      </Text>
      {Array.isArray(rows) && rows.length > 0 && (
        <Box mt={2}>
          <Text fontSize="xs" color="fg.muted" mb={1}>
            Строки проекции
          </Text>
          <Flex direction="column" gap={0.5} fontSize="xs">
            {rows.slice(0, 24).map((r, i) => (
              <Text key={i}>
                {String((r as { queue_name?: string }).queue_name ?? "?")}: depth{" "}
                {String((r as { depth?: number }).depth ?? "?")} (
                {String((r as { category?: string | null }).category ?? "—")})
              </Text>
            ))}
            {rows.length > 24 && (
              <Text color="fg.muted">… ещё {rows.length - 24}</Text>
            )}
          </Flex>
        </Box>
      )}
    </Flex>
  )
}

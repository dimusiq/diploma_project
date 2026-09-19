import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as simFleet from "@/api/simFleet.ts"
import { FleetParkPage } from "../FleetParkPage"

vi.mock("@/hooks/useCustomToast.ts", () => ({
  default: () => ({
    showErrorToast: vi.fn(),
    showSuccessToast: vi.fn(),
  }),
}))

const agv: simFleet.FleetDevice = {
  id: "id-agv-1",
  code: "agv-1",
  name: "AGV-01",
  description: null,
  category: "transport",
  kind: "agv",
  device_type: "AGV",
  enabled: true,
  archived: false,
  configuration: {
    speed: 1.5,
    battery: 80,
    home: { x: 22, z: 9 },
    zoneId: "zone-stor",
  },
  runtime: {
    status: "idle",
    online: true,
    battery: 84,
    position: { x: 22, z: 9 },
    taskId: null,
    inSimulation: true,
  },
  created_at: null,
  updated_at: null,
}

const sensor: simFleet.FleetDevice = {
  ...agv,
  id: "id-sns-1",
  code: "sns-T-01",
  name: "SENSOR T-01",
  category: "sensor",
  kind: "sensor",
  device_type: "SENSOR",
  configuration: {
    speed: 0,
    battery: null,
    home: { x: 34, z: 9 },
    zoneId: "zone-stor",
    metricKind: "temperature",
    metricUnit: "°C",
    metric: 19,
  },
  runtime: {
    status: "running",
    online: true,
    battery: null,
    position: { x: 34, z: 9 },
    taskId: null,
    metric: 19,
    metricKind: "temperature",
    metricUnit: "°C",
    inSimulation: true,
  },
}

const dock: simFleet.FleetDevice = {
  ...agv,
  id: "id-dock-1",
  code: "dock-in-1",
  name: "DOCK IN-1",
  category: "gate",
  kind: "dock_door",
  device_type: "DOCK",
  configuration: {
    speed: 0,
    battery: null,
    home: { x: 3, z: 10 },
    zoneId: "zone-recv",
  },
  runtime: {
    status: "idle",
    online: true,
    battery: null,
    position: { x: 3, z: 10 },
    taskId: null,
    inSimulation: true,
  },
}

const catalog = {
  kinds: ["agv", "sensor", "dock_door"],
  categories: [
    { id: "all", label: "Всё", columns: ["name", "code", "kind", "status", "enabled", "actions"] },
    { id: "transport", label: "Транспорт", columns: ["name", "code", "kind", "status", "enabled", "actions"] },
    { id: "scanner", label: "Сканеры", columns: ["name", "code", "actions"] },
    { id: "conveyor", label: "Конвейеры", columns: ["name", "code", "actions"] },
    { id: "sensor", label: "Датчики", columns: ["name", "code", "subtype", "value", "unit", "actions"] },
    { id: "gate", label: "Ворота", columns: ["name", "code", "status", "actions"] },
    { id: "charging", label: "Зарядные станции", columns: ["name", "code", "actions"] },
    { id: "other", label: "Прочее", columns: ["name", "code", "actions"] },
  ],
  types: [
    {
      kind: "agv",
      category: "transport",
      label: "AGV",
      fields: ["name", "code"],
      simulated: true,
      taskCapable: true,
    },
  ],
  zones: [
    { id: "zone-stor", name: "Хранение", kind: "storage" },
    { id: "zone-recv", name: "Приёмка", kind: "receiving" },
  ],
  sensorMetrics: [{ id: "temperature", label: "Температура" }],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <FleetParkPage canManage />
    </QueryClientProvider>,
  )
}

describe("FleetParkPage / Оборудование", () => {
  beforeEach(() => {
    vi.spyOn(simFleet, "fetchSimFleet").mockResolvedValue({
      data: [agv, sensor, dock],
      count: 3,
      ...catalog,
    })
    vi.spyOn(simFleet, "createSimFleetDevice").mockResolvedValue({
      ...agv,
      id: "id-agv-4",
      code: "agv-4",
      name: "AGV Север",
    })
    vi.spyOn(simFleet, "patchSimFleetDevice").mockImplementation(
      async (_id, body) => ({
        ...agv,
        name: body.name ?? agv.name,
        enabled: body.enabled ?? agv.enabled,
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("вкладка Всё показывает парк и русские статусы", async () => {
    renderPage()
    await screen.findByRole("heading", { name: "Оборудование" })
    expect(await screen.findByText("AGV-01")).toBeTruthy()
    expect(screen.getByText("SENSOR T-01")).toBeTruthy()
    expect(screen.getByText("DOCK IN-1")).toBeTruthy()
    expect(screen.getAllByText("Простаивает").length).toBeGreaterThan(0)
  })

  it("вкладки фильтруют категории", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("AGV-01")
    await user.click(screen.getByRole("tab", { name: /Транспорт/ }))
    expect(screen.getByText("AGV-01")).toBeTruthy()
    expect(screen.queryByText("SENSOR T-01")).toBeNull()
    await user.click(screen.getByRole("tab", { name: /Датчики/ }))
    expect(screen.getByText("SENSOR T-01")).toBeTruthy()
    expect(screen.getByText("Температура")).toBeTruthy()
    expect(screen.queryByText("AGV-01")).toBeNull()
    await user.click(screen.getByRole("tab", { name: /Ворота/ }))
    expect(screen.getByText("DOCK IN-1")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: /Сканеры/ }))
    expect(screen.getByText("Нет оборудования по выбранным фильтрам")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: /Конвейеры/ }))
    expect(screen.getByText("Нет оборудования по выбранным фильтрам")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: /Зарядные станции/ }))
    expect(screen.getByText("Нет оборудования по выбранным фильтрам")).toBeTruthy()
  })

  it("добавляет оборудование", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("AGV-01")
    await user.click(screen.getByRole("button", { name: "Добавить оборудование" }))
    await user.type(screen.getByPlaceholderText("AGV Север"), "AGV Север")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => {
      expect(simFleet.createSimFleetDevice).toHaveBeenCalled()
    })
  })

  it("переименовывает и не даёт править runtime", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("AGV-01")
    await user.click(screen.getAllByRole("button", { name: "Действия" })[0])
    await user.click(screen.getByText("Редактировать"))
    expect(screen.getByTestId("runtime-readonly").textContent).toMatch(
      /Простаивает/,
    )
    expect(screen.queryByLabelText("Позиция")).toBeNull()
    const name = screen.getByPlaceholderText("AGV Север")
    await user.clear(name)
    await user.type(name, "AGV Alpha")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => {
      expect(simFleet.patchSimFleetDevice).toHaveBeenCalledWith(
        "id-agv-1",
        expect.objectContaining({ name: "AGV Alpha" }),
      )
    })
  })

  it("фильтрует по поиску и типу", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("AGV-01")
    await user.type(screen.getByLabelText("Поиск"), "SENSOR")
    expect(screen.getByText("SENSOR T-01")).toBeTruthy()
    expect(screen.queryByText("AGV-01")).toBeNull()
    await user.clear(screen.getByLabelText("Поиск"))
    await user.click(screen.getByRole("tab", { name: /Транспорт/ }))
    expect(screen.getByText("AGV-01")).toBeTruthy()
  })

  it("клик по названию открывает карточку", async () => {
    const user = userEvent.setup()
    const onOpenDevice = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <FleetParkPage canManage onOpenDevice={onOpenDevice} />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole("button", { name: "AGV-01" }))
    expect(onOpenDevice).toHaveBeenCalledWith(expect.objectContaining({ id: "id-agv-1" }))
  })

  it("включает и отключает устройство", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("AGV-01")
    await user.click(screen.getAllByRole("button", { name: "Действия" })[0])
    await user.click(screen.getByText("Отключить"))
    await waitFor(() => {
      expect(simFleet.patchSimFleetDevice).toHaveBeenCalledWith("id-agv-1", {
        enabled: false,
      })
    })
  })
})

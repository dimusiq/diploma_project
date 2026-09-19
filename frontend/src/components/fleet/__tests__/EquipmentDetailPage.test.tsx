import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as simFleet from "@/api/simFleet.ts"
import { EquipmentDetailPage } from "../EquipmentDetailPage"

vi.mock("@/hooks/useCustomToast.ts", () => ({
  default: () => ({
    showErrorToast: vi.fn(),
    showSuccessToast: vi.fn(),
  }),
}))

const device: simFleet.FleetDevice = {
  id: "id-agv-1",
  code: "agv-1",
  name: "AGV-01",
  description: "Тестовый AGV",
  category: "transport",
  kind: "agv",
  device_type: "AGV",
  enabled: true,
  archived: false,
  inMaintenance: false,
  configuration: {
    speed: 1.5,
    battery: 80,
    home: { x: 22, z: 9 },
    zoneId: "zone-stor",
  },
  runtime: {
    status: "idle",
    online: true,
    battery: 78,
    position: { x: 22, z: 9 },
    taskId: null,
    inSimulation: true,
  },
  maintenance: {
    count: 0,
    overdueCount: 0,
    lastAt: null,
    nextAt: null,
    status: null,
    tone: "ok",
  },
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
}

function renderCard() {
  const onBack = vi.fn()
  const onShowOnMap = vi.fn()
  const onShowEvents = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <EquipmentDetailPage
        deviceId="id-agv-1"
        canManage
        onBack={onBack}
        onShowOnMap={onShowOnMap}
        onShowEvents={onShowEvents}
      />
    </QueryClientProvider>,
  )
  return { onBack, onShowOnMap, onShowEvents }
}

describe("EquipmentDetailPage", () => {
  beforeEach(() => {
    vi.spyOn(simFleet, "fetchSimFleetDevice").mockResolvedValue(device)
    vi.spyOn(simFleet, "fetchSimFleet").mockResolvedValue({
      data: [device],
      count: 1,
      kinds: ["agv"],
      categories: [],
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
      zones: [{ id: "zone-stor", name: "Хранение", kind: "storage" }],
      sensorMetrics: [],
    })
    vi.spyOn(simFleet, "fetchDeviceMaintenance").mockResolvedValue({
      data: [],
      count: 0,
      summary: device.maintenance!,
    })
    vi.spyOn(simFleet, "fetchDeviceTasks").mockResolvedValue({ data: [], count: 0 })
    vi.spyOn(simFleet, "fetchDeviceEvents").mockResolvedValue({ data: [], count: 0 })
    vi.spyOn(simFleet, "patchSimFleetDevice").mockResolvedValue({
      ...device,
      name: "Погрузчик №1",
    })
    vi.spyOn(simFleet, "createDeviceMaintenance").mockResolvedValue({
      id: "m-1",
      device_id: "id-agv-1",
      type: "preventive",
      status: "planned",
      title: "Плановое ТО",
      description: null,
      priority: "medium",
      scheduled_at: null,
      started_at: null,
      completed_at: null,
      performed_by: null,
      notes: null,
      created_at: "2026-09-19T10:00:00Z",
      updated_at: "2026-09-19T10:00:00Z",
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("открывает карточку и секции ТО", async () => {
    renderCard()
    expect(await screen.findByRole("heading", { name: "AGV-01" })).toBeTruthy()
    expect(screen.getByText("Техническое обслуживание")).toBeTruthy()
    expect(screen.getByText("Текущее состояние")).toBeTruthy()
    expect(screen.getByText("Нет активной задачи")).toBeTruthy()
  })

  it("меняет название через PATCH", async () => {
    const user = userEvent.setup()
    renderCard()
    await screen.findByRole("heading", { name: "AGV-01" })
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    const input = screen.getByDisplayValue("AGV-01")
    await user.clear(input)
    await user.type(input, "Погрузчик №1")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => {
      expect(simFleet.patchSimFleetDevice).toHaveBeenCalledWith(
        "id-agv-1",
        expect.objectContaining({ name: "Погрузчик №1" }),
      )
    })
  })

  it("создаёт ТО", async () => {
    const user = userEvent.setup()
    renderCard()
    await screen.findByRole("heading", { name: "AGV-01" })
    await user.click(screen.getByRole("button", { name: "Создать ТО" }))
    await user.type(screen.getByLabelText("Название ТО"), "Плановое ТО")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => {
      expect(simFleet.createDeviceMaintenance).toHaveBeenCalled()
    })
  })

  it("переходит в Digital Twin", async () => {
    const user = userEvent.setup()
    const { onShowOnMap } = renderCard()
    await screen.findByRole("heading", { name: "AGV-01" })
    await user.click(screen.getByRole("button", { name: "Показать на карте" }))
    expect(onShowOnMap).toHaveBeenCalledWith("agv-1")
  })

  it("открывает события с фильтром устройства", async () => {
    const user = userEvent.setup()
    const { onShowEvents } = renderCard()
    await screen.findByRole("heading", { name: "AGV-01" })
    await user.click(screen.getByRole("button", { name: "Показать все события" }))
    expect(onShowEvents).toHaveBeenCalledWith("agv-1")
  })
})

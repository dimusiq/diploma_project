import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as maintenanceSchedule from "@/api/maintenanceSchedule.ts"
import * as simFleet from "@/api/simFleet.ts"
import { MaintenanceScheduleTable } from "../MaintenanceScheduleTable.tsx"

vi.mock("@/hooks/useCustomToast.ts", () => ({
  default: () => ({
    showErrorToast: vi.fn(),
    showSuccessToast: vi.fn(),
  }),
}))

const agv: simFleet.FleetDevice = {
  id: "id-agv-1",
  code: "agv-1",
  name: "AGV Погрузчик №1",
  description: null,
  category: "transport",
  kind: "agv",
  device_type: "AGV",
  enabled: true,
  archived: false,
  inMaintenance: true,
  engine_hours: 80,
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

function renderTable() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MaintenanceScheduleTable />
    </QueryClientProvider>,
  )
}

describe("MaintenanceScheduleTable", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(simFleet, "fetchSimFleet").mockResolvedValue({
      data: [agv],
      count: 1,
      kinds: ["agv"],
      categories: [],
      types: [],
      zones: [{ id: "zone-stor", name: "Зона А", kind: "storage" }],
      sensorMetrics: [],
    })
    vi.spyOn(maintenanceSchedule.maintenanceScheduleApi, "listChains").mockResolvedValue({
      data: [],
      count: 0,
    })
    vi.spyOn(maintenanceSchedule.maintenanceScheduleApi, "getConfig").mockResolvedValue({
      default_intervals: [500],
      default_remind_before_hours: 50,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("показывает canonical fleet, а не CMMS brand/model", async () => {
    renderTable()
    expect(await screen.findByText("AGV Погрузчик №1")).toBeTruthy()
    expect(screen.getByText("agv-1")).toBeTruthy()
    expect(screen.getByText("Зона А")).toBeTruthy()
    expect(screen.getByText("На обслуживании")).toBeTruthy()
    expect(screen.queryByText("Jungheinrich")).toBeNull()
  })
})

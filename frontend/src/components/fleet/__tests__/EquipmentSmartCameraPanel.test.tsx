import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as simFleet from "@/api/simFleet.ts"
import type { FleetDevice } from "@/api/simFleet.ts"
import { CameraEquipmentSection } from "@/components/digitalTwin/SmartCameraView.tsx"
import { EquipmentSmartCameraPanel } from "@/components/fleet/EquipmentSmartCameraPanel.tsx"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const host: FleetDevice = {
  id: "host-1",
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
    home: { x: 0, z: 0 },
  },
  runtime: {
    status: "idle",
    online: true,
    battery: 80,
    position: { x: 0, z: 0 },
    taskId: null,
    inSimulation: true,
  },
  created_at: null,
  updated_at: null,
  smart_camera: null,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  return {
    ...view,
    rerenderChild: (next: React.ReactNode) =>
      view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>),
  }
}

describe("EquipmentSmartCameraPanel", () => {
  beforeEach(() => {
    vi.spyOn(simFleet, "fetchAvailableSmartCameras").mockResolvedValue({
      data: [
        {
          device_id: "cam-free",
          code: "CAM-002",
          name: "CAM-002",
          status: "online",
          model: "Scene camera",
        },
      ],
      count: 1,
    })
    vi.spyOn(simFleet, "assignDeviceSmartCamera").mockResolvedValue({
      smart_camera: {
        device_id: "cam-free",
        code: "CAM-002",
        name: "CAM-002",
        status: "online",
      },
    })
    vi.spyOn(simFleet, "replaceDeviceSmartCamera").mockResolvedValue({
      smart_camera: {
        device_id: "cam-3",
        code: "CAM-003",
        name: "CAM-003",
        status: "online",
      },
    })
    vi.spyOn(simFleet, "unassignDeviceSmartCamera").mockResolvedValue({
      smart_camera: null,
    })
    vi.spyOn(simFleet, "fetchSimFleetDevice").mockImplementation(async () => ({
      ...host,
      smart_camera: {
        device_id: "cam-free",
        code: "CAM-002",
        name: "CAM-002",
        status: "online",
      },
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows assign CTA when camera is missing", () => {
    wrap(<EquipmentSmartCameraPanel device={host} canEdit />)
    expect(screen.getByTestId("equipment-smart-camera-panel")).toBeTruthy()
    expect(screen.getByText("Умная камера не назначена")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Назначить камеру" })).toBeTruthy()
  })

  it("opens free camera list and assigns", async () => {
    const onChange = vi.fn()
    wrap(<EquipmentSmartCameraPanel device={host} canEdit onDeviceChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Назначить камеру" }))
    await waitFor(() => expect(screen.getByText("CAM-002")).toBeTruthy())
    fireEvent.click(screen.getByRole("option", { name: /CAM-002/ }))
    fireEvent.click(screen.getByRole("button", { name: "Назначить" }))
    await waitFor(() => expect(simFleet.assignDeviceSmartCamera).toHaveBeenCalledWith("host-1", "cam-free"))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it("shows replace and unassign when camera is assigned", async () => {
    const assigned = {
      ...host,
      smart_camera: {
        device_id: "cam-1",
        code: "CAM-001",
        name: "CAM-001",
        status: "online",
        last_signal_at: "2026-09-27T14:32:00Z",
      },
    }
    vi.spyOn(simFleet, "fetchSimFleetDevice").mockResolvedValue({ ...assigned, smart_camera: null })
    wrap(<EquipmentSmartCameraPanel device={assigned} canEdit />)
    expect(screen.getByText("CAM-001")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Заменить" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Открепить" }))
    expect(screen.getByRole("heading", { name: "Открепить умную камеру?" })).toBeTruthy()
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Открепить" }))
    await waitFor(() => expect(simFleet.unassignDeviceSmartCamera).toHaveBeenCalledWith("host-1"))
  })

  it("hides actions without edit rights", () => {
    wrap(<EquipmentSmartCameraPanel device={host} canEdit={false} />)
    expect(screen.queryByRole("button", { name: "Назначить камеру" })).toBeNull()
  })
})

describe("CameraEquipmentSection detail panel", () => {
  it("shows not assigned without camera and camera code when installed", () => {
    const view = renderWithClient(
      <CameraEquipmentSection
        equipmentId="agv-1"
        name="AGV-01"
        camera={{ installed: false }}
        canControl={false}
      />,
    )
    expect(screen.getByText("Не назначена")).toBeTruthy()
    view.rerenderChild(
      <CameraEquipmentSection
        equipmentId="agv-1"
        name="AGV-01"
        camera={{
          installed: true,
          camera_code: "CAM-001",
          online: true,
          enabled: true,
          fps: 24,
          detection_count: 10,
          last_frame_at: "2026-09-27T14:32:00Z",
        }}
        equipmentOnline
        canControl={false}
      />,
    )
    expect(screen.getByText("CAM-001")).toBeTruthy()
    expect(screen.getByText("24")).toBeTruthy()
    expect(screen.getByText("10")).toBeTruthy()
  })
})

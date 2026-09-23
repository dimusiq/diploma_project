import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { CameraDetection } from "@/api/smartCamera.ts"
import {
  CameraEquipmentSection,
  SmartCameraView,
  cameraAvailability,
} from "@/components/digitalTwin/SmartCameraView.tsx"

const person: CameraDetection = {
  id: "agv-1:0:person",
  camera_id: "agv-1-cam",
  equipment_id: "agv-1",
  timestamp: "2026-01-01T00:00:00Z",
  class_name: "person",
  confidence: 0.89,
  bbox: { x: 70, y: 48, width: 120, height: 250 },
  track_id: null,
  severity: "info",
}

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  )
}

describe("SmartCameraView", () => {
  it("renders the camera heading and a detection box", () => {
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="yolo-demo"
        fps={8}
        detections={[person]}
        description={"Обнаружено:\n1 человек\nЧеловек впереди слева"}
        obstacle={false}
      />,
    )
    expect(screen.getByRole("heading", { name: "AGV-01" })).toBeInTheDocument()
    expect(screen.getByTestId("detection-box")).toBeInTheDocument()
    expect(screen.getByTestId("focus-object")).toHaveTextContent("Неизвестный человек")
    expect(screen.getByTestId("focus-object")).toHaveTextContent("0.89")
    expect(screen.getByText("● ONLINE")).toBeInTheDocument()
    expect(screen.getByText("● LIVE")).toBeInTheDocument()
    expect(screen.getByText("8 FPS")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Запустить демо" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Остановить" })).not.toBeInTheDocument()
    expect(screen.getAllByTestId("detection-box")).toHaveLength(1)
  })

  it("renders the AGV scene viewport and a focus control", () => {
    const onFocus = vi.fn()
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="scene-camera"
        fps={24}
        sceneViewport
        detections={[]}
        description=""
        obstacle={false}
        onFocus={onFocus}
      />,
    )
    expect(screen.getByTestId("agv-camera-viewport")).toBeInTheDocument()
    expect(screen.getByText("CAM-AGV-01")).toBeInTheDocument()
    expect(screen.getByText("● REC")).toBeInTheDocument()
    expect(screen.getByText("● LIVE")).toBeInTheDocument()
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="scene-camera"
        fps={24}
        detections={[
          {
            ...person,
            world_position: { x: 1, y: 1, z: 4 },
          },
        ]}
        description=""
        obstacle={false}
        onFocus={onFocus}
      />,
    )
    screen.getAllByTestId("focus-object")[0]?.click()
    expect(onFocus).toHaveBeenCalledWith({ x: 1, y: 1, z: 4 })
  })

  it("shows the offline state", () => {
    render(
      <SmartCameraView
        name="AGV-01"
        online={false}
        model="yolo-demo"
        fps={0}
        detections={[person]}
        description=""
        obstacle={false}
      />,
    )
    expect(screen.getAllByText("Не в сети").length).toBeGreaterThan(0)
    expect(screen.queryByTestId("detection-box")).not.toBeInTheDocument()
  })

  it("shows an empty detection state", () => {
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="yolo-demo"
        fps={8}
        detections={[]}
        description={"Обнаружено:\nнет объектов"}
        obstacle={false}
      />,
    )
    expect(screen.getAllByText(/нет объектов/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Запустить демо" })).not.toBeInTheDocument()
  })

  it("shows an obstacle warning", () => {
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="yolo-demo"
        fps={8}
        detections={[
          {
            ...person,
            id: "agv-1:2:obstacle",
            class_name: "obstacle",
            confidence: 0.93,
          },
        ]}
        description="Обнаружено:\n1 препятствие"
        obstacle
        held
      />,
    )
    expect(screen.getAllByText("⚠ ОБЪЕКТ НА ТРАЕКТОРИИ").length).toBeGreaterThan(0)
    expect(screen.getByText("AGV остановлен")).toBeInTheDocument()
    expect(screen.getByTestId("focus-object")).toHaveTextContent("OBSTACLE")
    expect(screen.getByTestId("focus-object")).toHaveTextContent("0.93")
  })
})

function viewportSignature() {
  const node = screen.getByTestId("camera-viewport")
  const rect = node.getBoundingClientRect()
  return `${node.getAttribute("style")}|${rect.width}x${rect.height}`
}

describe("camera viewport layout", () => {
  it("keeps a fixed aspect ratio and an absolute overlay", () => {
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="scene-camera"
        fps={24}
        detections={[person]}
        description=""
        obstacle={false}
      />,
    )
    const viewport = screen.getByTestId("camera-viewport")
    const overlay = screen.getByTestId("camera-overlay")
    expect(viewport.style.position).toBe("relative")
    expect(viewport.style.aspectRatio).toBe("16 / 9")
    expect(viewport.style.overflow).toBe("hidden")
    expect(viewport.style.width).toBe("100%")
    expect(viewport.style.minWidth).toBe("0px")
    expect(overlay.style.position).toBe("absolute")
    expect(overlay.style.overflow).toBe("hidden")
    expect(screen.getByTestId("detection-box").style.position).toBe("absolute")
    expect(screen.getByTestId("focus-object").style.position).toBe("absolute")
    const list = screen.getByTestId("detection-list")
    expect(list.className).toContain("max-h-28")
    expect(list.className).toContain("overflow-y-auto")
    expect(viewport.contains(list)).toBe(false)
  })

  it("does not change the viewport when detections are added", () => {
    const view = (count: number) => (
      <SmartCameraView
        name="AGV-01"
        online
        model="scene-camera"
        fps={24}
        detections={Array.from({ length: count }, (_, index) => ({
          ...person,
          id: `det-${index}`,
          track_id: `very-long-track-${index}-that-must-not-stretch-the-card`,
          bbox: { x: -40, y: -10, width: 900, height: 700 },
        }))}
        description=""
        obstacle={false}
      />
    )
    render(view(0))
    const empty = viewportSignature()
    cleanup()
    render(view(1))
    const one = viewportSignature()
    cleanup()
    render(view(10))
    const many = viewportSignature()
    expect(one).toBe(empty)
    expect(many).toBe(empty)
    expect(screen.getAllByTestId("detection-box")).toHaveLength(10)
  })

  it("drops a bbox that falls completely outside the viewport", () => {
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="scene-camera"
        fps={24}
        detections={[
          {
            ...person,
            bbox: { x: -80, y: -40, width: 20, height: 10 },
          },
        ]}
        description=""
        obstacle={false}
      />,
    )
    expect(screen.queryByTestId("detection-box")).not.toBeInTheDocument()
  })
})

describe("CameraEquipmentSection", () => {
  it("hides a camera that is not installed and opens one that is", () => {
    wrap(<CameraEquipmentSection equipmentId="fl-1" name="FORKLIFT-01" camera={null} canControl={false} />)
    expect(screen.getByText("Камера не установлена")).toBeInTheDocument()
  })

  it("shows smart camera status for equipment that has a camera", () => {
    wrap(
      <CameraEquipmentSection
        equipmentId="agv-1"
        name="AGV-01"
        canControl={false}
        camera={{
          installed: true,
          online: true,
          model: "yolo-demo",
          fps: 8,
          detection_count: 2,
          detections: [person],
        }}
      />,
    )
    expect(screen.getByRole("button", { name: /Smart Camera/ })).toBeInTheDocument()
    expect(screen.getByText("В сети")).toBeInTheDocument()
    expect(screen.getByText("LIVE")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Запустить демо" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Показать камеру в 3D" })).not.toBeInTheDocument()
  })

  it("treats an enabled camera on online equipment as live", () => {
    expect(cameraAvailability({ installed: true, enabled: true, online: false }, true)).toBe("live")
    expect(cameraAvailability({ installed: true, enabled: false, online: true }, true)).toBe("disabled")
    expect(cameraAvailability({ installed: true, enabled: true, online: true }, false)).toBe("offline")
  })

  it("goes live without a start button and keeps the viewport size", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ installed: true, online: true, equipment_id: "agv-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    wrap(
      <CameraEquipmentSection
        equipmentId="agv-1"
        name="AGV-01"
        canControl
        equipmentOnline
        camera={{
          installed: true,
          enabled: true,
          online: false,
          model: "scene-camera",
          fps: 0,
          detections: [],
        }}
      />,
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const startCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/camera/control"))
    expect(startCall).toBeTruthy()
    expect(JSON.parse(String((startCall?.[1] as RequestInit).body)).action).toBe("start")
    fetchMock.mockRestore()
    fireEvent.click(screen.getByRole("button", { name: /Smart Camera/ }))
    expect(screen.getByText("● ONLINE")).toBeInTheDocument()
    expect(screen.getByText("● LIVE")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Запустить демо" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Остановить" })).not.toBeInTheDocument()
    const dialog = screen.getByTestId("smart-camera-dialog")
    expect(dialog.className).toContain("w-[min(1200px,calc(100vw-48px))]")
    const viewport = screen.getByTestId("camera-viewport")
    expect(viewport.style.aspectRatio).toBe("16 / 9")
    expect(viewport.style.width).toBe("100%")
    expect(screen.getByTestId("camera-overlay").style.position).toBe("absolute")
    const empty = viewportSignature()
    expect(screen.getByTestId("detection-list").className).toContain("max-h-28")
    expect(empty).toContain("16 / 9")
    expect(screen.getByTestId("agv-camera-viewport")).toBeInTheDocument()
  })
})

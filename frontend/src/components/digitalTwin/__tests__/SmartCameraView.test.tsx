import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { CameraDetection } from "@/api/smartCamera.ts"
import {
  CameraEquipmentSection,
  SmartCameraView,
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
    expect(screen.getByTestId("detection-box")).toHaveTextContent("PERSON")
    expect(screen.getByTestId("detection-box")).toHaveTextContent("0.89")
    expect(screen.getByText("● ONLINE")).toBeInTheDocument()
    expect(screen.getByText("● DEMO")).toBeInTheDocument()
    expect(screen.getByText("8 FPS")).toBeInTheDocument()
    expect(screen.getAllByTestId("detection-box")).toHaveLength(1)
  })

  it("renders the AGV scene viewport and a focus control", () => {
    const onFocus = vi.fn()
    render(
      <SmartCameraView
        name="AGV-01"
        online
        model="scene-camera"
        source="scene"
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
    expect(screen.getByText("REC ●")).toBeInTheDocument()
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
    expect(screen.getByText("Нет препятствий")).toBeInTheDocument()
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
    expect(screen.getByText("Остановлено камерой")).toBeInTheDocument()
    expect(screen.getByText("AGV STOPPED")).toBeInTheDocument()
    expect(screen.getByTestId("detection-box")).toHaveTextContent("OBSTACLE")
    expect(screen.getByTestId("detection-box")).toHaveTextContent("0.93")
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
  })
})

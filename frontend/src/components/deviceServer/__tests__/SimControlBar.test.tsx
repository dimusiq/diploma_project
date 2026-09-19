import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SimControlBar } from "../SimControlBar"
import { deviceSimulation } from "../simStore.ts"

function snapshot(state: "STOPPED" | "RUNNING" | "PAUSED") {
  return {
    ...deviceSimulation.getDataSnapshot(),
    state,
    running: state === "RUNNING",
  }
}

describe("SimControlBar", () => {
  beforeEach(() => {
    vi.spyOn(deviceSimulation, "start").mockImplementation(() => undefined)
    vi.spyOn(deviceSimulation, "pause").mockImplementation(() => undefined)
    vi.spyOn(deviceSimulation, "stop").mockImplementation(() => undefined)
    vi.spyOn(deviceSimulation, "reset").mockImplementation(() => undefined)
    vi.spyOn(deviceSimulation, "startDemo").mockResolvedValue(undefined)
    vi.spyOn(deviceSimulation, "resetDemo").mockResolvedValue(undefined)
    vi.spyOn(deviceSimulation, "setSpeed").mockImplementation(() => undefined)
    vi.spyOn(deviceSimulation, "command").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows a Russian simulation run state", () => {
    render(<SimControlBar />)
    expect(screen.getByText("ОСТАНОВЛЕНО")).toBeTruthy()
    expect(screen.queryByText("STOPPED")).toBeNull()
  })

  it("keeps START and demo as separate actions", async () => {
    render(<SimControlBar />)
    fireEvent.click(screen.getByTitle("Запустить текущую симуляцию"))
    expect(deviceSimulation.start).toHaveBeenCalledTimes(1)
    expect(deviceSimulation.startDemo).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(
        screen.getByTitle(
          "Запустить заранее подготовленный демонстрационный сценарий",
        ),
      )
    })
    expect(deviceSimulation.startDemo).toHaveBeenCalledTimes(1)
    expect(deviceSimulation.start).toHaveBeenCalledTimes(1)
  })

  it("keeps RESET and demo reset on different handlers", async () => {
    render(<SimControlBar />)
    fireEvent.click(screen.getByTitle("Сбросить текущее состояние симуляции"))
    expect(deviceSimulation.reset).toHaveBeenCalledTimes(1)
    expect(deviceSimulation.resetDemo).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(
        screen.getByTitle("Сбросить состояние демонстрационного сценария"),
      )
    })
    expect(deviceSimulation.resetDemo).toHaveBeenCalledTimes(1)
    expect(deviceSimulation.reset).toHaveBeenCalledTimes(1)
  })

  it("ignores a second demo start while the first request is in flight", async () => {
    let resolve!: () => void
    vi.mocked(deviceSimulation.startDemo).mockReturnValue(
      new Promise<void>((r) => {
        resolve = r
      }),
    )
    render(<SimControlBar />)
    const startDemo = screen.getByTitle(
      "Запустить заранее подготовленный демонстрационный сценарий",
    )
    await act(async () => {
      fireEvent.click(startDemo)
      fireEvent.click(startDemo)
    })
    expect(deviceSimulation.startDemo).toHaveBeenCalledTimes(1)
    resolve()
  })

  it("disables START and demo start while running", () => {
    vi.spyOn(deviceSimulation, "getDataSnapshot").mockReturnValue(
      snapshot("RUNNING"),
    )
    render(<SimControlBar />)
    const start = screen.getByRole("button", { name: /START/ })
    expect((start as HTMLButtonElement).disabled).toBe(true)
    expect(
      (
        screen.getByTitle(
          "Приостановить текущую симуляцию",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    expect(
      (
        screen.getByTitle(
          "Запустить заранее подготовленный демонстрационный сценарий",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it("keeps speed and emergency stop controls", () => {
    render(<SimControlBar />)
    fireEvent.click(screen.getByRole("button", { name: "2×" }))
    expect(deviceSimulation.setSpeed).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole("button", { name: /Аварийный стоп/ }))
    expect(deviceSimulation.command).toHaveBeenCalledWith({
      type: "emergencyStop",
    })
  })
})

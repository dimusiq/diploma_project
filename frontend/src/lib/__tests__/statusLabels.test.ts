import { describe, expect, it, vi } from "vitest"
import {
  getDeviceStatusLabel,
  getEventStatusLabel,
  getOrderStatusLabel,
  getPriorityLabel,
  getSeverityLabel,
  getSimulationStatusLabel,
  getStatusLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
} from "../statusLabels.ts"

describe("statusLabels", () => {
  it("maps warehouse task statuses to Russian labels", () => {
    expect(getTaskStatusLabel("pending")).toBe("Ожидает")
    expect(getTaskStatusLabel("blocking")).toBe("Блокирует")
    expect(getTaskStatusLabel("blocked")).toBe("Заблокировано")
    expect(getTaskStatusLabel("completed")).toBe("Завершено")
    expect(getTaskStatusLabel("in_progress")).toBe("Выполняется")
  })

  it("returns the raw value for an unknown status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(getTaskStatusLabel("unknown_status")).toBe("unknown_status")
    expect(getStatusLabel("unknown_status")).toBe("unknown_status")
    warn.mockRestore()
  })

  it("does not crash when backend adds a new enum", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(getOrderStatusLabel("brand_new_flow")).toBe("brand_new_flow")
    warn.mockRestore()
  })

  it("keeps blocking distinct from blocked", () => {
    expect(getTaskStatusLabel("blocking")).not.toBe(getTaskStatusLabel("blocked"))
    expect(getStatusLabel("blocking")).toBe("Блокирует")
    expect(getStatusLabel("blocked")).toBe("Заблокировано")
  })

  it("localizes device, simulation, priority and severity", () => {
    expect(getDeviceStatusLabel("online")).toBe("В сети")
    expect(getDeviceStatusLabel("idle")).toBe("Простаивает")
    expect(getDeviceStatusLabel("charging")).toBe("Заряжается")
    expect(getSimulationStatusLabel("STOPPED", { uppercase: true })).toBe(
      "ОСТАНОВЛЕНО",
    )
    expect(getSimulationStatusLabel("RUNNING", { uppercase: true })).toBe(
      "ВЫПОЛНЯЕТСЯ",
    )
    expect(getSimulationStatusLabel("PAUSED", { uppercase: true })).toBe(
      "ПРИОСТАНОВЛЕНО",
    )
    expect(getPriorityLabel("high")).toBe("Высокий")
    expect(getPriorityLabel(8)).toBe("Критический")
    expect(getSeverityLabel("warning")).toBe("Предупреждение")
    expect(getEventStatusLabel("processed")).toBe("Обработано")
    expect(getTaskTypeLabel("putaway")).toBe("Размещение")
  })

  it("does not translate API values — helpers are presentation-only", () => {
    const apiStatus = "in_progress"
    expect(apiStatus).toBe("in_progress")
    expect(getTaskStatusLabel(apiStatus)).toBe("Выполняется")
  })
})

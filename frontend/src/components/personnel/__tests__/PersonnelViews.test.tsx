import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PersonnelForm } from "@/components/personnel/PersonnelForm.tsx"
import { PersonnelRuntimePanel } from "@/components/personnel/PersonnelRuntimePanel.tsx"
import { PersonnelTable } from "@/components/personnel/PersonnelTable.tsx"
import type { WorkerMotion } from "@/components/deviceServer/simStore.ts"
import type { PersonnelRecord } from "@/lib/personnel.ts"

const employee: PersonnelRecord = {
  id: "11111111-1111-4111-8111-111111111001",
  employee_code: "EMP-001",
  first_name: "Иван",
  last_name: "Иванов",
  middle_name: "Иванович",
  position: "Кладовщик",
  department: "Склад №1",
  status: "active",
  shift: "day",
  current_zone: "aisle-2",
  motion_status: "walking",
}

const motion: WorkerMotion = {
  id: "wrk-1",
  code: "PERSON-001",
  name: "Иванов Иван Иванович",
  displayName: "Иванов Иван Иванович",
  employeeCode: "EMP-001",
  positionTitle: "Кладовщик",
  shift: "day",
  x: 40,
  z: 10,
  heading: 0,
  speed: 1.3,
  status: "walking",
  currentZone: "aisle-2",
  target: "packing",
}

describe("personnel views", () => {
  it("shows the directory row", () => {
    render(
      <PersonnelTable
        rows={[employee]}
        canEdit
        onOpen={() => undefined}
        onEdit={() => undefined}
        onDeactivate={() => undefined}
      />,
    )
    expect(screen.getByText("Иванов Иван Иванович")).toBeTruthy()
    expect(screen.getByText("EMP-001")).toBeTruthy()
    expect(screen.getByText("Aisle 2")).toBeTruthy()
    expect(screen.getByText("Перемещается")).toBeTruthy()
    expect(screen.getByText("Дневная")).toBeTruthy()
    expect(screen.getByText("Активен")).toBeTruthy()
  })

  it("submits a new employee", () => {
    const onSubmit = vi.fn()
    render(<PersonnelForm initial={null} submitting={false} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Табельный номер"), { target: { value: "EMP-010" } })
    fireEvent.change(screen.getByLabelText("Фамилия"), { target: { value: "Кузнецова" } })
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Мария" } })
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      employee_code: "EMP-010",
      last_name: "Кузнецова",
      first_name: "Мария",
      position: "Кладовщик",
      shift: "day",
      status: "active",
    }))
  })

  it("shows the selected person in the detail panel", () => {
    render(<PersonnelRuntimePanel person={motion} taskTitle="Забор товара" />)
    const panel = screen.getByTestId("personnel-runtime-panel")
    expect(panel.textContent).toContain("Иванов Иван Иванович")
    expect(panel.textContent).toContain("Кладовщик")
    expect(panel.textContent).toContain("EMP-001")
    expect(panel.textContent).toContain("Aisle 2")
    expect(panel.textContent).toContain("Перемещается")
    expect(panel.textContent).toContain("1.3 м/с")
    expect(panel.textContent).toContain("Забор товара")
    expect(panel.textContent).toContain("На смене")
  })
})

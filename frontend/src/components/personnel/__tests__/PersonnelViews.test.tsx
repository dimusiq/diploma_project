import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { PersonnelFilters } from "@/components/personnel/PersonnelFilters.tsx"
import { PersonnelForm } from "@/components/personnel/PersonnelForm.tsx"
import { PersonnelRuntimePanel } from "@/components/personnel/PersonnelRuntimePanel.tsx"
import { PersonnelTable } from "@/components/personnel/PersonnelTable.tsx"
import type { WorkerMotion } from "@/components/deviceServer/simStore.ts"
import { EMPLOYEE_STATUSES, type PersonnelRecord } from "@/lib/personnel.ts"

const employee: PersonnelRecord = {
  id: "11111111-1111-4111-8111-111111111001",
  employee_code: "EMP-001",
  first_name: "Иван",
  last_name: "Иванов",
  middle_name: "Иванович",
  position: "Кладовщик",
  department: "Склад №1",
  status: "working",
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

function dated(status: PersonnelRecord["status"], until: string): PersonnelRecord {
  return { ...employee, id: status, status, status_until: until }
}

describe("personnel views", () => {
  it("shows the four statuses and hides the old inactive label", () => {
    render(
      <PersonnelTable
        rows={[
          employee,
          dated("sick", "2026-09-25"),
          dated("vacation", "2026-10-10"),
          { ...employee, id: "break", status: "break", status_until: null },
        ]}
        canEdit
        selectedIds={new Set()}
        onSelectedIdsChange={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />,
    )
    expect(screen.getByText("Работает")).toBeTruthy()
    expect(screen.getByText("На больничном")).toBeTruthy()
    expect(screen.getByText("до 25.09.2026")).toBeTruthy()
    expect(screen.getByText("В отпуске")).toBeTruthy()
    expect(screen.getByText("до 10.10.2026")).toBeTruthy()
    expect(screen.getByText("Перерыв")).toBeTruthy()
    expect(screen.queryByText("Не активен")).toBeNull()
    expect(screen.queryByText("Неактивен")).toBeNull()
    expect(screen.queryByText("Открыть")).toBeNull()
    expect(screen.queryByText("Деактивировать")).toBeNull()
    expect(screen.getAllByRole("button", { name: "Редактировать" })).toHaveLength(4)
    expect(screen.getAllByRole("button", { name: "Удалить" })).toHaveLength(4)
  })

  it("asks before deleting and then drops the row", () => {
    const onDelete = vi.fn()
    function Harness() {
      const [rows, setRows] = useState([employee])
      return (
        <PersonnelTable
          rows={rows}
          canEdit
          selectedIds={new Set()}
          onSelectedIdsChange={() => undefined}
          onEdit={() => undefined}
          onDelete={(row) => {
            onDelete(row)
            setRows((current) => current.filter((item) => item.id !== row.id))
          }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))
    expect(screen.getByRole("heading", { name: "Удалить сотрудника?" })).toBeTruthy()
    expect(screen.getByText("Сотрудник будет удалён из списка персонала.")).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }))
    expect(screen.getByText("Иванов Иван Иванович")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByText("Иванов Иван Иванович")).toBeNull()
  })

  it("submits a working employee without a status date", () => {
    const onSubmit = vi.fn()
    render(<PersonnelForm initial={null} submitting={false} onSubmit={onSubmit} />)
    expect(screen.queryByLabelText("До даты")).toBeNull()
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
      status: "working",
      status_until: null,
    }))
  })

  it("shows the end date for sick and vacation and clears it for working and break", () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <PersonnelForm
        initial={{ ...employee, status: "sick", status_until: "2026-09-25" }}
        submitting={false}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByLabelText("До даты")).toHaveProperty("value", "2026-09-25")
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: "sick",
      status_until: "2026-09-25",
    }))

    rerender(
      <PersonnelForm
        key="vacation"
        initial={{ ...employee, status: "vacation", status_until: "2026-10-10" }}
        submitting={false}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByLabelText("До даты")).toHaveProperty("value", "2026-10-10")

    rerender(
      <PersonnelForm key="working" initial={employee} submitting={false} onSubmit={onSubmit} />,
    )
    expect(screen.queryByLabelText("До даты")).toBeNull()

    rerender(
      <PersonnelForm
        key="break"
        initial={{ ...employee, status: "break", status_until: "2026-10-01" }}
        submitting={false}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.queryByLabelText("До даты")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "break",
      status_until: null,
    }))
  })

  it("does not save sick leave without an end date", () => {
    const onSubmit = vi.fn()
    render(
      <PersonnelForm
        initial={{ ...employee, status: "sick", status_until: null }}
        submitting={false}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.submit(screen.getByRole("button", { name: "Сохранить" }).closest("form")!)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText("Укажите дату")).toBeTruthy()
  })

  it("filters only the four statuses", () => {
    render(
      <PersonnelFilters
        value={{ q: "", position: "", shift: "", status: "" }}
        onChange={() => undefined}
      />,
    )
    expect(EMPLOYEE_STATUSES).toEqual(["working", "sick", "vacation", "break"])
    expect(screen.getByRole("combobox", { name: "Статус" })).toBeTruthy()
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

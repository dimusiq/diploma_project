import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { PersonnelBulkBar } from "@/components/personnel/PersonnelBulkBar.tsx"
import { PersonnelTable } from "@/components/personnel/PersonnelTable.tsx"
import type { PersonnelRecord } from "@/lib/personnel.ts"

const a: PersonnelRecord = {
  id: "id-a",
  employee_code: "EMP-A",
  first_name: "Анна",
  last_name: "Алексеева",
  position: "Кладовщик",
  department: "Склад №1",
  status: "working",
  shift: "day",
}

const b: PersonnelRecord = {
  ...a,
  id: "id-b",
  employee_code: "EMP-B",
  first_name: "Борис",
  last_name: "Борисов",
  status: "break",
}

describe("personnel bulk selection", () => {
  it("header checkbox selects and clears all visible rows", () => {
    function Harness() {
      const [selected, setSelected] = useState<Set<string>>(new Set())
      return (
        <div>
          <p data-testid="count">Выбрано: {selected.size}</p>
          <PersonnelTable
            rows={[a, b]}
            canEdit
            selectedIds={selected}
            onSelectedIdsChange={setSelected}
            onEdit={() => undefined}
            onDelete={() => undefined}
          />
        </div>
      )
    }
    render(<Harness />)
    const header = screen.getByLabelText("Выбрать всех видимых")
    fireEvent.click(header)
    expect(screen.getByTestId("count").textContent).toBe("Выбрано: 2")
    fireEvent.click(header)
    expect(screen.getByTestId("count").textContent).toBe("Выбрано: 0")
  })

  it("allows selecting individual rows and shows indeterminate when partial", () => {
    function Harness() {
      const [selected, setSelected] = useState<Set<string>>(new Set())
      return (
        <PersonnelTable
          rows={[a, b]}
          canEdit
          selectedIds={selected}
          onSelectedIdsChange={setSelected}
          onEdit={() => undefined}
          onDelete={() => undefined}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByLabelText("Выбрать Алексеева Анна"))
    expect(screen.getByLabelText("Выбрать всех видимых").getAttribute("data-state")).toBe(
      "indeterminate",
    )
    expect(screen.getByLabelText("Выбрать Алексеева Анна").getAttribute("data-state")).toBe("checked")
    expect(screen.getByLabelText("Выбрать Борисов Борис").getAttribute("data-state")).not.toBe(
      "checked",
    )
  })

  it("does not select filtered-out rows when choosing all visible", () => {
    function Harness() {
      const [selected, setSelected] = useState<Set<string>>(new Set(["hidden-id"]))
      return (
        <div>
          <p data-testid="count">{selected.size}</p>
          <PersonnelTable
            rows={[a]}
            canEdit
            selectedIds={selected}
            onSelectedIdsChange={setSelected}
            onEdit={() => undefined}
            onDelete={() => undefined}
          />
        </div>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByLabelText("Выбрать всех видимых"))
    expect(screen.getByTestId("count").textContent).toBe("2")
    fireEvent.click(screen.getByLabelText("Выбрать всех видимых"))
    expect(screen.getByTestId("count").textContent).toBe("1")
  })
})

describe("personnel bulk bar", () => {
  it("is hidden without selection and shows actions when selected", () => {
    const { rerender } = render(
      <PersonnelBulkBar
        selectedCount={0}
        canEdit
        departments={["Склад №1", "Склад №2"]}
        onClear={() => undefined}
        onMove={() => undefined}
        onDelete={() => undefined}
      />,
    )
    expect(screen.queryByTestId("personnel-bulk-bar")).toBeNull()

    rerender(
      <PersonnelBulkBar
        selectedCount={3}
        canEdit
        departments={["Склад №1", "Склад №2"]}
        onClear={() => undefined}
        onMove={() => undefined}
        onDelete={() => undefined}
      />,
    )
    expect(screen.getByText("Выбрано: 3")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Переместить в подразделение" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Удалить" })).toBeTruthy()
  })

  it("opens move dialog and submits selected department", () => {
    const onMove = vi.fn()
    render(
      <PersonnelBulkBar
        selectedCount={2}
        canEdit
        departments={["Склад №1", "Склад №2"]}
        onClear={() => undefined}
        onMove={onMove}
        onDelete={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Переместить в подразделение" }))
    expect(screen.getByTestId("personnel-bulk-move-dialog")).toBeTruthy()
    expect(screen.getByText("Выбрано сотрудников: 2")).toBeTruthy()
    // Dialog preselects the first department on open.
    fireEvent.click(screen.getByRole("button", { name: "Переместить" }))
    expect(onMove).toHaveBeenCalledWith("Склад №1")
  })

  it("opens delete confirmation before deleting", () => {
    const onDelete = vi.fn()
    render(
      <PersonnelBulkBar
        selectedCount={2}
        canEdit
        departments={["Склад №1"]}
        onClear={() => undefined}
        onMove={() => undefined}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))
    expect(screen.getByRole("heading", { name: "Удалить сотрудников?" })).toBeTruthy()
    expect(screen.getByText(/Будет удалено сотрудников: 2/)).toBeTruthy()
    expect(screen.getByText(/Действие нельзя отменить/)).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("hides bulk actions without edit rights", () => {
    render(
      <PersonnelBulkBar
        selectedCount={2}
        canEdit={false}
        departments={["Склад №1"]}
        onClear={() => undefined}
        onMove={() => undefined}
        onDelete={() => undefined}
      />,
    )
    expect(screen.queryByTestId("personnel-bulk-bar")).toBeNull()
  })
})

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { personnelApi } from "@/api/personnel.ts"
import { PersonnelBraceletPanel } from "@/components/personnel/PersonnelBraceletPanel.tsx"
import { PersonnelForm } from "@/components/personnel/PersonnelForm.tsx"
import { PersonnelTable } from "@/components/personnel/PersonnelTable.tsx"
import type { PersonnelRecord } from "@/lib/personnel.ts"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
}

const assigned: PersonnelRecord = {
  ...employee,
  bracelet: {
    device_id: "dev-1",
    code: "RB-001",
    name: "RB-001",
    status: "online",
    battery: 80,
    last_signal_at: "2026-09-27T14:32:00Z",
    location_label: "aisle-2",
    location_source: "simulation",
    location_stale: false,
  },
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe("PersonnelBraceletPanel", () => {
  beforeEach(() => {
    vi.spyOn(personnelApi, "availableBracelets").mockResolvedValue({
      data: [
        {
          device_id: "dev-free",
          code: "RB-009",
          name: "RB-009",
          status: "online",
          battery: 91,
        },
      ],
      count: 1,
    })
    vi.spyOn(personnelApi, "assignBracelet").mockImplementation(async (_id, deviceId) => ({
      ...employee,
      bracelet: {
        device_id: deviceId,
        code: "RB-009",
        name: "RB-009",
        status: "online",
        battery: 91,
        last_signal_at: null,
        location_label: null,
        location_source: "simulation",
        location_stale: false,
      },
    }))
    vi.spyOn(personnelApi, "replaceBracelet").mockImplementation(async (_id, deviceId) => ({
      ...employee,
      bracelet: {
        device_id: deviceId,
        code: "RB-002",
        name: "RB-002",
        status: "online",
        battery: 70,
        last_signal_at: null,
        location_label: null,
        location_source: "simulation",
        location_stale: false,
      },
    }))
    vi.spyOn(personnelApi, "unassignBracelet").mockResolvedValue({
      ...employee,
      bracelet: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows assign action when bracelet is missing", () => {
    wrap(<PersonnelBraceletPanel employee={employee} canEdit />)
    expect(screen.getByText("Браслет не назначен")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Назначить браслет" })).toBeTruthy()
  })

  it("opens free-bracelet picker and assigns via API", async () => {
    const onEmployeeChange = vi.fn()
    wrap(
      <PersonnelBraceletPanel
        employee={employee}
        canEdit
        onEmployeeChange={onEmployeeChange}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Назначить браслет" }))
    expect(screen.getByTestId("bracelet-picker")).toBeTruthy()
    await waitFor(() => expect(personnelApi.availableBracelets).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("option", { name: /RB-009/ })).toBeTruthy())
    fireEvent.click(screen.getByRole("option", { name: /RB-009/ }))
    fireEvent.click(
      within(screen.getByTestId("bracelet-picker")).getByRole("button", { name: "Сохранить" }),
    )
    await waitFor(() =>
      expect(personnelApi.assignBracelet).toHaveBeenCalledWith(employee.id, "dev-free"),
    )
    await waitFor(() => expect(onEmployeeChange).toHaveBeenCalled())
  })

  it("shows assigned bracelet and requires confirmation before unassign", async () => {
    wrap(<PersonnelBraceletPanel employee={assigned} canEdit />)
    expect(screen.getByText("RB-001")).toBeTruthy()
    expect(screen.getByText("В сети")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Заменить" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Снять браслет" }))
    expect(screen.getByRole("heading", { name: "Снять браслет?" })).toBeTruthy()
    expect(
      screen.getByText("Браслет RB-001 перестанет быть закреплён за сотрудником."),
    ).toBeTruthy()
    expect(personnelApi.unassignBracelet).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Снять браслет" }))
    await waitFor(() => expect(personnelApi.unassignBracelet).toHaveBeenCalledWith(employee.id))
  })

  it("replace opens picker for free bracelets only", async () => {
    wrap(<PersonnelBraceletPanel employee={assigned} canEdit />)
    fireEvent.click(screen.getByRole("button", { name: "Заменить" }))
    expect(screen.getByText("Выберите новый браслет")).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("option", { name: /RB-009/ })).toBeTruthy())
    expect(screen.getAllByText("Браслет-радиомаяк").length).toBeGreaterThan(0)
  })

  it("after unassign shows empty state via parent update", async () => {
    function Harness() {
      const [row, setRow] = useState(assigned)
      return <PersonnelBraceletPanel employee={row} canEdit onEmployeeChange={setRow} />
    }
    wrap(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Снять браслет" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Снять браслет" }))
    await waitFor(() => expect(screen.getByText("Браслет не назначен")).toBeTruthy())
  })
})

describe("Personnel edit card bracelet block", () => {
  it("puts bracelet panel inside the employee form before save", () => {
    wrap(
      <PersonnelForm
        initial={employee}
        submitting={false}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        footer={<PersonnelBraceletPanel employee={employee} canEdit />}
      />,
    )
    expect(screen.getByTestId("personnel-bracelet-panel")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Назначить браслет" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy()
  })

  it("edit action opens form that can host bracelet controls", () => {
    const onEdit = vi.fn()
    render(
      <PersonnelTable
        rows={[employee]}
        canEdit
        selectedIds={new Set()}
        onSelectedIdsChange={() => undefined}
        onEdit={onEdit}
        onDelete={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }))
    expect(onEdit).toHaveBeenCalledWith(employee)
  })
})

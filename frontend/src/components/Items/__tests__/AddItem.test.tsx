import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CategoriesService, ItemsService } from "@/client/index.ts"

import AddItem from "../AddItem"

let queryClient: QueryClient

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("AddItem", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createItemSpy: any

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    vi.spyOn(CategoriesService, "readCategories").mockResolvedValue([] as any)
    createItemSpy = vi
      .spyOn(ItemsService, "createItem")
      .mockResolvedValue({ id: "new-1" } as any)
  })

  afterEach(() => {
    queryClient.clear()
    vi.restoreAllMocks()
  })

  it("renders the trigger button", () => {
    render(<AddItem />, { wrapper: Wrapper })

    expect(screen.getByText("Добавить")).toBeInTheDocument()
  })

  it("opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    expect(
      await screen.findByText("Добавить поступление"),
    ).toBeInTheDocument()
  })

  it("renders all form fields in the dialog", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    await screen.findByText("Добавить поступление")

    expect(screen.getByPlaceholderText("Название")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Описание")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("1")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Артикул")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Штрихкод")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("шт, кг, л, упак.")).toBeInTheDocument()
  })

  it("shows the cancel and save buttons", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    await screen.findByText("Добавить поступление")

    expect(screen.getByText("Отмена")).toBeInTheDocument()
    expect(screen.getByText("Сохранить")).toBeInTheDocument()
  })

  it("save button is disabled when title is empty (default state)", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    await screen.findByText("Добавить поступление")

    const saveBtn = screen.getByText("Сохранить").closest("button")
    expect(saveBtn).toBeDisabled()
  })

  it("enables save when required fields are filled", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    await screen.findByText("Добавить поступление")

    const titleInput = screen.getByPlaceholderText("Название")
    await user.type(titleInput, "New Widget")
    await user.tab()

    await waitFor(() => {
      const saveBtn = screen.getByText("Сохранить").closest("button")
      expect(saveBtn).not.toBeDisabled()
    })
  })

  it("calls createItem on valid submit", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    await screen.findByText("Добавить поступление")

    await user.type(screen.getByPlaceholderText("Название"), "New Widget")
    await user.tab()

    await waitFor(() => {
      expect(
        screen.getByText("Сохранить").closest("button"),
      ).not.toBeDisabled()
    })

    const form = screen.getByText("Сохранить").closest("form")!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledTimes(1)
    })

    const callArg = createItemSpy.mock.calls[0][0]
    expect(callArg).toEqual(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          title: "New Widget",
        }),
      }),
    )
  })

  it("closes dialog after cancel", async () => {
    const user = userEvent.setup()

    render(<AddItem />, { wrapper: Wrapper })
    await user.click(screen.getByText("Добавить"))

    await screen.findByText("Добавить поступление")
    await user.click(screen.getByText("Отмена"))

    await waitFor(() => {
      expect(
        screen.queryByText("Добавить поступление"),
      ).not.toBeInTheDocument()
    })
  })
})

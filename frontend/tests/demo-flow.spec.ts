import { expect, type Page, test } from "@playwright/test"

test.describe.configure({ mode: "serial" })
test.use({ viewport: { width: 1440, height: 900 } })

async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("access_token"))
  expect(token).toBeTruthy()
  return token as string
}

async function hasEvent(page: Page, eventType: string): Promise<boolean> {
  const token = await accessToken(page)
  const response = await page.request.get(
    `/api/v1/warehouse-sim/events?event_type=${eventType}&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok()) return false
  const body = (await response.json()) as { data?: Array<{ type: string }> }
  return (body.data ?? []).some((event) => event.type === eventType)
}

async function waitForEvent(page: Page, eventType: string, timeout: number) {
  await expect
    .poll(() => hasEvent(page, eventType), {
      timeout,
      intervals: [1000, 2000, 3000],
    })
    .toBe(true)
}

test("demo scenario reaches receiving, scan and equipment motion", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto("/control-tower")
  await expect(
    page.getByRole("heading", { name: "Control Tower" }),
  ).toBeVisible()

  await page.goto("/digital-twin")
  await expect(page.getByRole("heading", { name: "Digital Twin" })).toBeVisible()

  await page.goto("/device-server")
  await expect(
    page.getByRole("heading", { name: "Device Monitor" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Запустить демо" }).click()
  await page.getByRole("button", { name: "50×" }).click()

  await expect(page.getByText("Прибытие")).toBeVisible({ timeout: 30_000 })
  await waitForEvent(page, "TRUCK_ARRIVED", 60_000)
  await waitForEvent(page, "RECEIVING_STARTED", 120_000)
  await waitForEvent(page, "ITEM_SCANNED", 120_000)
  await waitForEvent(page, "ITEM_RECEIVED", 120_000)
  await waitForEvent(page, "ITEM_STORED", 180_000)
  await waitForEvent(page, "DEVICE_MOVING", 180_000)

  await page.goto("/digital-twin?tab=map&view=2d")
  await expect(page.getByRole("heading", { name: "Digital Twin" })).toBeVisible()
  await page.goto("/warehouse-3d?perf=1")
  await expect(page.locator("canvas").first()).toBeVisible()
})

test("outbound order 360 shows fulfillment sections", async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto("/device-server")
  await waitForEvent(page, "ORDER_CREATED", 180_000)

  const token = await accessToken(page)
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/v1/outbound-orders/?limit=20",
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok()) return ""
        const body = (await response.json()) as {
          data?: Array<{ id: string; extra?: { sim_id?: string } | null }>
        }
        return (
          body.data?.find((order) => order.extra?.sim_id)?.id ?? ""
        )
      },
      { timeout: 60_000, intervals: [2000, 3000] },
    )
    .not.toBe("")

  const list = await page.request.get("/api/v1/outbound-orders/?limit=20", {
    headers: { Authorization: `Bearer ${token}` },
  })
  const orders = (await list.json()) as {
    data: Array<{ id: string; extra?: { sim_id?: string } | null }>
  }
  const order = orders.data.find((row) => row.extra?.sim_id)
  expect(order).toBeTruthy()

  const resolved = await page.request.get(
    `/api/v1/outbound-orders/resolve?sim_id=${order?.extra?.sim_id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(resolved.ok()).toBeTruthy()
  const resolvedId = ((await resolved.json()) as { id: string }).id
  expect(resolvedId).toBe(order?.id)

  await page.goto(`/outbound-orders?order=${order?.id}`)
  await expect(page.getByRole("heading", { name: /Заказ #/ })).toBeVisible()
  for (const tab of [
    "Общее",
    "Позиции",
    "Хронология",
    "Задания",
    "Техника",
    "Отгрузка",
    "События",
  ]) {
    await page.getByRole("tab", { name: tab }).click()
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  }
})

test("shipment and departure close the demo order", async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto("/shipment")
  await expect(page.getByRole("heading", { name: "Отгрузка" })).toBeVisible()

  await page.goto("/device-server")
  await waitForEvent(page, "ITEM_PACKED", 180_000)
  await waitForEvent(page, "ITEM_SHIPPED", 240_000)
  await waitForEvent(page, "TRUCK_DEPARTED", 240_000)

  await page.goto("/events")
  await expect(page.getByRole("heading", { name: "События" })).toBeVisible()

  const token = await accessToken(page)
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/v1/outbound-orders/?status=shipped&limit=5",
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok()) return 0
        const body = (await response.json()) as { count?: number }
        return body.count ?? 0
      },
      { timeout: 60_000, intervals: [2000, 3000] },
    )
    .toBeGreaterThan(0)
})

import { expect, type Page, test } from "@playwright/test"

test.use({ viewport: { width: 1440, height: 900 } })

async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("access_token"))
  expect(token).toBeTruthy()
  return token as string
}

test("smart camera looks at the digital twin", async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto("/device-server")
  await expect(page.getByRole("heading", { name: "Device Monitor" })).toBeVisible()
  await page.goto("/digital-twin?tab=map&view=3d&deviceId=agv-1")
  await expect(page.getByRole("heading", { name: "Digital Twin" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Smart Camera/ })).toBeVisible()
  await page.getByRole("button", { name: /Smart Camera/ }).click()
  await expect(page.getByRole("heading", { name: "AGV-01" })).toBeVisible()
  await expect(page.getByTestId("agv-camera-viewport")).toBeVisible()
  await expect(page.getByText("CAM-AGV-01")).toBeVisible()
  const frustum = page.getByRole("checkbox", { name: "Show camera frustum" })
  await expect(frustum).not.toBeChecked()
  await page.getByRole("button", { name: "Запустить демо" }).click()
  await expect(page.getByText("● ONLINE")).toBeVisible()
  const token = await accessToken(page)
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/v1/warehouse-sim/events?event_type=CAMERA_PERSON_DETECTED&limit=5",
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok()) return false
        const body = (await response.json()) as { data?: unknown[] }
        return (body.data ?? []).length > 0
      },
      { timeout: 40_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(true)
  await expect(page.getByTestId("detection-box").first()).toBeVisible()
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/v1/warehouse-sim/events?event_type=CAMERA_OBSTACLE_CLEARED&limit=5",
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok()) return false
        const body = (await response.json()) as { data?: unknown[] }
        return (body.data ?? []).length > 0
      },
      { timeout: 50_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(true)
})

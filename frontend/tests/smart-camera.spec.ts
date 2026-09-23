import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 1440, height: 900 } })

test("smart camera looks at the digital twin", async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto("/device-server")
  await expect(page.getByRole("heading", { name: "Device Monitor" })).toBeVisible()
  await page.goto("/digital-twin?tab=map&view=3d&deviceId=agv-1")
  await expect(page.getByRole("heading", { name: "Digital Twin" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Smart Camera/ })).toBeVisible()
  const frustum = page.getByRole("checkbox", { name: "Show camera frustum" })
  await expect(frustum).not.toBeChecked()
  await page.getByRole("button", { name: /Smart Camera/ }).click()
  const dialog = page.getByTestId("smart-camera-dialog")
  await expect(dialog.getByRole("heading", { name: "AGV-01" })).toBeVisible()
  await expect(dialog.getByTestId("agv-camera-viewport")).toBeVisible()
  await expect(dialog.getByText("CAM-AGV-01")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Запустить демо" })).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "Остановить" })).toHaveCount(0)
  await expect(dialog.getByText("● ONLINE")).toBeVisible()
  await expect(dialog.getByText("● LIVE")).toBeVisible()
  await expect(dialog.getByTestId("camera-viewport")).toBeVisible()
})

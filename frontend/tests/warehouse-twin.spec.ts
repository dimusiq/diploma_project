import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

test.use({ storageState: { cookies: [], origins: [] } })

test("страница аналитики двойника открывается после входа", async ({ page }) => {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill(firstSuperuser)
  await page.getByPlaceholder("Password", { exact: true }).fill(firstSuperuserPassword)
  await page.getByRole("button", { name: "Log In" }).click()
  await page.waitForURL("/")

  await page.goto("/warehouse-twin")
  await expect(
    page.getByRole("heading", { name: "Аналитика цифрового двойника" }),
  ).toBeVisible()
  await expect(page.getByText("Что если (упрощённая модель)")).toBeVisible()
})

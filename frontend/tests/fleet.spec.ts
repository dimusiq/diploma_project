import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

test.use({ storageState: { cookies: [], origins: [] } })

test("оборудование: существующий парк, вкладки и Device Monitor", async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill(firstSuperuser)
  await page
    .getByPlaceholder("Пароль", { exact: true })
    .fill(firstSuperuserPassword)
  await page.getByRole("button", { name: "Войти" }).click()
  await page.waitForURL("/")

  await page.goto("/fleet")
  await expect(page.getByRole("heading", { name: "Оборудование" })).toBeVisible()
  await expect(page.getByText("AGV-01")).toBeVisible()

  await page.getByRole("tab", { name: /Транспорт/ }).click()
  await expect(page.getByText("AGV-01")).toBeVisible()

  await page.getByRole("tab", { name: /Датчики/ }).click()
  await expect(page.getByText(/SENSOR T-01/)).toBeVisible()

  await page.getByRole("tab", { name: /Ворота/ }).click()
  await expect(page.getByText(/DOCK IN-1/)).toBeVisible()

  await page.getByRole("tab", { name: /^Всё/ }).click()
  const code = `agv-e2e-${Date.now().toString().slice(-6)}`
  const name = `AGV E2E ${code}`
  await page.getByRole("button", { name: "Добавить оборудование" }).click()
  await page.getByPlaceholder("AGV Север").fill(name)
  await page.getByPlaceholder("agv-4").fill(code)
  const created = page.waitForResponse(
    (res) =>
      res.url().includes("/warehouse-sim/fleet") &&
      res.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Сохранить" }).click()
  expect((await created).ok()).toBeTruthy()
  await expect(
    page.getByRole("heading", { name: "Добавить оборудование" }),
  ).toBeHidden()
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()

  await page.getByRole("tab", { name: /Транспорт/ }).click()
  await expect(page.getByText(name)).toBeVisible()

  await page.goto("/device-server")
  await expect(page.getByRole("heading", { name: "Device Monitor" })).toBeVisible()
  await expect(page.getByText(name)).toBeVisible()
})

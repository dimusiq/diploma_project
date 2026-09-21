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

  await page.goto("/equipment")
  await expect(page.getByRole("heading", { name: "Оборудование" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Оборудование" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Парк", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Парк техники" })).toHaveCount(0)

  await page.goto("/fleet")
  await expect(page).toHaveURL(/\/equipment\/?$/)

  await page.goto("/technique")
  await expect(page).toHaveURL(/\/equipment\/?$/)
  await expect(page.getByRole("heading", { name: "Оборудование" })).toBeVisible()

  await page.goto("/technique/maintenance")
  await expect(page.getByRole("heading", { name: "ТО", exact: true })).toBeVisible()

  await page.goto("/technique/work-orders")
  await expect(page.getByRole("heading", { name: "Наряды", exact: true })).toBeVisible()

  await page.goto("/technique/analytics")
  await expect(page.getByRole("heading", { name: "Аналитика", exact: true })).toBeVisible()

  await page.goto("/equipment")

  await expect(page.getByText("AGV-01")).toBeVisible()

  await page.getByRole("tab", { name: /Транспорт/ }).click()
  await expect(page.getByText("AGV-01")).toBeVisible()

  await page.getByRole("tab", { name: /Датчики/ }).click()
  await expect(page.getByText(/SENSOR T-01/)).toBeVisible()

  await page.getByRole("tab", { name: /Ворота/ }).click()
  await expect(page.getByText(/DOCK IN-1/)).toBeVisible()

  await page.getByRole("tab", { name: /^Всё/ }).click()
  await page.getByRole("button", { name: "AGV-01" }).click()
  await expect(page.getByRole("heading", { name: "AGV-01" })).toBeVisible()
  await expect(page.getByText("Техническое обслуживание")).toBeVisible()
  await expect(page.getByRole("button", { name: "Все наряды" })).toBeVisible()
  await page.getByRole("button", { name: "← Оборудование" }).click()

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

  await page.getByRole("button", { name }).click()
  await expect(page.getByRole("heading", { name })).toBeVisible()
  await page.getByRole("button", { name: "Редактировать" }).click()
  await page.locator(`input[value="${name}"]`).fill(`${name} Twin`)
  await page.getByRole("button", { name: "Сохранить" }).click()
  await expect(page.getByRole("heading", { name: `${name} Twin` })).toBeVisible()

  await page.getByRole("button", { name: "Создать ТО" }).click()
  await page.getByLabel("Название ТО").fill("Плановое ТО e2e")
  await page.getByRole("button", { name: "Сохранить" }).click()
  await expect(page.getByText("Плановое ТО e2e")).toBeVisible()

  const deviceUrl = page.url()
  const deviceId = deviceUrl.match(/\/equipment\/([^/?#]+)/)?.[1]
  expect(deviceId).toBeTruthy()

  await page.goto("/technique/maintenance")
  await expect(page.getByRole("heading", { name: "ТО", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Список техники" })).toHaveCount(0)
  await expect(page.getByText(`${name} Twin`)).toBeVisible()
  await page.getByText(`${name} Twin`, { exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/equipment/${deviceId}`))
  await expect(page.getByRole("heading", { name: `${name} Twin` })).toBeVisible()
  await expect(page.getByText("Плановое ТО e2e")).toBeVisible()

  await page.goto(`/technique/equipment/${deviceId}`)
  await expect(page).toHaveURL(new RegExp(`/equipment/${deviceId}`))
  await page.goto("/technique/equipment/new")
  await expect(page).toHaveURL(/\/equipment\/?$/)

  await page.goto(`/equipment/${deviceId}`)
  await page.getByRole("button", { name: "Показать на карте" }).click()
  await expect(page.getByRole("heading", { name: "Digital Twin" })).toBeVisible()

  await page.goto("/device-server")
  await expect(page.getByRole("heading", { name: "Device Monitor" })).toBeVisible()
  await expect(page.getByText(`${name} Twin`)).toBeVisible()
})

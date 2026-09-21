import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

test.use({ storageState: { cookies: [], origins: [] } })

test("страница отгрузки показывает operational empty state", async ({
  page,
}) => {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill(firstSuperuser)
  await page
    .getByPlaceholder("Пароль", { exact: true })
    .fill(firstSuperuserPassword)
  await page.getByRole("button", { name: "Войти" }).click()
  await page.waitForURL("**/control-tower")

  await page.goto("/shipment")
  await expect(page.getByRole("heading", { name: "Отгрузка" })).toBeVisible()
  await expect(
    page.getByText("Нет заказов, готовых к отгрузке").or(
      page.getByText("Готово к отгрузке"),
    ),
  ).toBeVisible()
})

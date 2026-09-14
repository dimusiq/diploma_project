import { expect, test } from "@playwright/test"

test("некорректный page в query приводится к валидной странице поступлений", async ({
  page,
}) => {
  await page.goto("/items?page=nope")
  await expect(
    page.getByRole("heading", { name: "Поступления" }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: /ошибк/i })).toHaveCount(0)
})

test("page=2 открывает поступления без падения", async ({ page }) => {
  await page.goto("/items?page=2")
  await expect(
    page.getByRole("heading", { name: "Поступления" }),
  ).toBeVisible()
})

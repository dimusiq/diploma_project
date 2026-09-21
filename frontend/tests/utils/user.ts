import { expect, type Page } from "@playwright/test"

export async function signUpNewUser(
  page: Page,
  name: string,
  email: string,
  password: string,
) {
  await page.goto("/signup")

  await page.getByPlaceholder("Полное имя").fill(name)
  await page.getByPlaceholder("Email").fill(email)
  await page.getByPlaceholder("Пароль", { exact: true }).fill(password)
  await page.getByPlaceholder("Подтвердите пароль").fill(password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()
  await page.goto("/login")
}

export async function logInUser(page: Page, email: string, password: string) {
  await page.goto("/login")

  await page.getByPlaceholder("Email").fill(email)
  await page.getByPlaceholder("Пароль", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Войти" }).click()
  await page.waitForURL("**/control-tower")
  await expect(
    page.getByRole("heading", { name: "Control Tower" }),
  ).toBeVisible()
}

export async function logOutUser(page: Page) {
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: "Выйти" }).click()
  await page.goto("/login")
}

import { expect, type Page, test } from "@playwright/test"

import { randomEmail, randomPassword } from "./utils/random"

test.use({ storageState: { cookies: [], origins: [] } })

type OptionsType = {
  exact?: boolean
}

const fillForm = async (
  page: Page,
  full_name: string,
  email: string,
  password: string,
  confirm_password: string,
) => {
  await page.getByPlaceholder("Полное имя").fill(full_name)
  await page.getByPlaceholder("Email").fill(email)
  await page.getByPlaceholder("Пароль", { exact: true }).fill(password)
  await page.getByPlaceholder("Подтвердите пароль").fill(confirm_password)
}

const verifyInput = async (
  page: Page,
  placeholder: string,
  options?: OptionsType,
) => {
  const input = page.getByPlaceholder(placeholder, options)
  await expect(input).toBeVisible()
  await expect(input).toHaveText("")
  await expect(input).toBeEditable()
}

test("Inputs are visible, empty and editable", async ({ page }) => {
  await page.goto("/signup")

  await verifyInput(page, "Полное имя")
  await verifyInput(page, "Email")
  await verifyInput(page, "Пароль", { exact: true })
  await verifyInput(page, "Подтвердите пароль")
})

test("Sign Up button is visible", async ({ page }) => {
  await page.goto("/signup")

  await expect(
    page.getByRole("button", { name: "Зарегистрироваться" }),
  ).toBeVisible()
})

test("Log In link is visible", async ({ page }) => {
  await page.goto("/signup")

  await expect(page.getByRole("link", { name: "Войти" })).toBeVisible()
})

test("Sign up with valid name, email, and password", async ({ page }) => {
  const full_name = "Test User"
  const email = randomEmail()
  const password = randomPassword()

  await page.goto("/signup")
  await fillForm(page, full_name, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()
})

test("Sign up with invalid email", async ({ page }) => {
  await page.goto("/signup")

  await fillForm(
    page,
    "Playwright Test",
    "invalid@email",
    "changethis",
    "changethis",
  )
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(page.getByText("Некорректный email")).toBeVisible()
})

test("Sign up with existing email", async ({ page }) => {
  const fullName = "Test User"
  const email = randomEmail()
  const password = randomPassword()

  // Sign up with an email
  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  // Sign up again with the same email
  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(
    page.getByText("The user with this email already exists in the system", {
      exact: true,
    }),
  ).toBeVisible()
})

test("Sign up with weak password", async ({ page }) => {
  const fullName = "Test User"
  const email = randomEmail()
  const password = "weak"

  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(
    page.getByText("Пароль должен содержать не менее 8 символов"),
  ).toBeVisible()
})

test("Sign up with mismatched passwords", async ({ page }) => {
  const fullName = "Test User"
  const email = randomEmail()
  const password = randomPassword()
  const password2 = randomPassword()

  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password2)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(page.getByText("Пароль не совпадает")).toBeVisible()
})

test("Sign up with missing full name", async ({ page }) => {
  const fullName = ""
  const email = randomEmail()
  const password = randomPassword()

  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(
    page.getByText("Полное имя обязательно (не менее 3 символов)"),
  ).toBeVisible()
})

test("Sign up with missing email", async ({ page }) => {
  const fullName = "Test User"
  const email = ""
  const password = randomPassword()

  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(page.getByText("Email обязателен")).toBeVisible()
})

test("Sign up with missing password", async ({ page }) => {
  const fullName = "Test User"
  const email = randomEmail()
  const password = ""

  await page.goto("/signup")

  await fillForm(page, fullName, email, password, password)
  await page.getByRole("button", { name: "Зарегистрироваться" }).click()

  await expect(
    page.getByText("Пароль должен содержать не менее 8 символов"),
  ).toBeVisible()
})

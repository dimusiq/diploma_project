import { expect, type Page, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { createUser } from "./utils/privateApi.ts"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, logOutUser } from "./utils/user"

/** Блок «Изменить пароль» (два поля с placeholder «Новый пароль» на странице нет — но есть дубли в DOM при переключении вкладок). */
function changePasswordSection(page: Page) {
  return page.getByRole("heading", { name: "Изменить пароль" }).locator("..")
}

const tabs = ["Мой профиль", "Пароль", "Уведомления и отчёты", "Настройка темы"]

// User Information

test("My profile tab is active by default", async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByRole("tab", { name: "Мой профиль" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
})

test("All tabs are visible", async ({ page }) => {
  await page.goto("/settings")
  for (const tab of tabs) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible()
  }
})

test.describe("Edit user full name and email successfully", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Edit user name with a valid name", async ({ page }) => {
    const email = randomEmail()
    const updatedName = "Test User 2"
    const password = randomPassword()

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Мой профиль" }).click()
    await page.getByRole("button", { name: "Изменить" }).click()
    await page.getByLabel("Полное имя").fill(updatedName)
    await page.getByRole("button", { name: "Сохранить" }).click()
    await expect(page.getByText("Пользователь успешно обновлен.")).toBeVisible()
    // Check if the new name is displayed on the page
    await expect(
      page
        .getByRole("heading", { name: "Информация о пользователе" })
        .locator("..")
        .getByText(updatedName, { exact: true }),
    ).toBeVisible()
  })

  test("Edit user email with a valid email", async ({ page }) => {
    const email = randomEmail()
    const updatedEmail = randomEmail()
    const password = randomPassword()

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Мой профиль" }).click()
    await page.getByRole("button", { name: "Изменить" }).click()
    await page.getByLabel("Email").fill(updatedEmail)
    await page.getByRole("button", { name: "Сохранить" }).click()
    await expect(page.getByText("Пользователь успешно обновлен.")).toBeVisible()
    await expect(
      page
        .getByRole("heading", { name: "Информация о пользователе" })
        .locator("..")
        .getByText(updatedEmail, { exact: true }),
    ).toBeVisible()
  })
})

test.describe("Edit user with invalid data", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Edit user email with an invalid email", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const invalidEmail = ""

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Мой профиль" }).click()
    await page.getByRole("button", { name: "Изменить" }).click()
    await page.getByLabel("Email").fill(invalidEmail)
    await page.locator("body").click()
    await expect(page.getByText("Email is required")).toBeVisible()
  })

  test("Cancel edit action restores original name", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const updatedName = "Test User"

    const user = await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Мой профиль" }).click()
    await page.getByRole("button", { name: "Изменить" }).click()
    await page.getByLabel("Полное имя").fill(updatedName)
    await page.getByRole("button", { name: "Отмена" }).first().click()
    await expect(
      page
        .getByRole("heading", { name: "Информация о пользователе" })
        .locator("..")
        .getByText(user.full_name as string, { exact: true }),
    ).toBeVisible()
  })

  test("Cancel edit action restores original email", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const updatedEmail = randomEmail()

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Мой профиль" }).click()
    await page.getByRole("button", { name: "Изменить" }).click()
    await page.getByLabel("Email").fill(updatedEmail)
    await page.getByRole("button", { name: "Отмена" }).first().click()
    await expect(
      page
        .getByRole("heading", { name: "Информация о пользователе" })
        .locator("..")
        .getByText(email, { exact: true }),
    ).toBeVisible()
  })
})

// Change Password

test.describe("Change password successfully", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Update password successfully", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const NewPassword = randomPassword()

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Пароль" }).click()
    const pwdForm = changePasswordSection(page)
    await pwdForm.getByPlaceholder("Текущий пароль").fill(password)
    await pwdForm
      .getByPlaceholder("Новый пароль", { exact: true })
      .fill(NewPassword)
    await pwdForm.getByPlaceholder("Подвердите новый пароль").fill(NewPassword)
    await pwdForm
      .getByRole("button", { name: "Сохранить изменения" })
      .click({ force: true })
    await expect(page.getByText("Password updated successfully.")).toBeVisible()

    await logOutUser(page)

    // Check if the user can log in with the new password
    await logInUser(page, email, NewPassword)
  })
})

test.describe("Change password with invalid data", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Update password with weak passwords", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const weakPassword = "weak"

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Пароль" }).click()
    const pwdForm = changePasswordSection(page)
    await pwdForm.getByPlaceholder("Текущий пароль").fill(password)
    await pwdForm
      .getByPlaceholder("Новый пароль", { exact: true })
      .fill(weakPassword)
    await pwdForm.getByPlaceholder("Подвердите новый пароль").fill(weakPassword)
    await pwdForm.getByPlaceholder("Подвердите новый пароль").blur()
    await expect(
      page.getByText("Пароль должен содержать не менее 8 символов"),
    ).toBeVisible()
  })

  test("New password and confirmation password do not match", async ({
    page,
  }) => {
    const email = randomEmail()
    const password = randomPassword()
    const newPassword = randomPassword()
    const confirmPassword = randomPassword()

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Пароль" }).click()
    const pwdForm = changePasswordSection(page)
    await pwdForm.getByPlaceholder("Текущий пароль").fill(password)
    await pwdForm
      .getByPlaceholder("Новый пароль", { exact: true })
      .fill(newPassword)
    await pwdForm
      .getByPlaceholder("Подвердите новый пароль")
      .fill(confirmPassword)
    await pwdForm.getByPlaceholder("Подвердите новый пароль").blur()
    await expect(page.getByText("Пароль не совпадает")).toBeVisible()
  })

  test("Current password and new password are the same", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()

    await createUser({ email, password })

    // Log in the user
    await logInUser(page, email, password)

    await page.goto("/settings")
    await page.getByRole("tab", { name: "Пароль" }).click()
    const pwdForm = changePasswordSection(page)
    await pwdForm.getByPlaceholder("Текущий пароль").fill(password)
    await pwdForm
      .getByPlaceholder("Новый пароль", { exact: true })
      .fill(password)
    await pwdForm.getByPlaceholder("Подвердите новый пароль").fill(password)
    await pwdForm
      .getByRole("button", { name: "Сохранить изменения" })
      .click({ force: true })
    await expect(
      page.getByText("New password cannot be the same as the current one"),
    ).toBeVisible()
  })
})

// Appearance

test("Appearance tab is visible", async ({ page }) => {
  await page.goto("/settings")
  await page.getByRole("tab", { name: "Настройка темы" }).click()
  await expect(page.getByRole("heading", { name: "Выбор темы" })).toBeVisible()
})

test("User can switch from light mode to dark mode and vice versa", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.getByRole("tab", { name: "Настройка темы" }).click()

  // Ensure the initial state is light mode
  if (
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    )
  ) {
    await page.getByRole("radio", { name: "Светлая тема" }).click()
  }

  let isLightMode = await page.evaluate(
    () => !document.documentElement.classList.contains("dark"),
  )
  expect(isLightMode).toBe(true)

  await page.getByRole("radio", { name: "Темная тема" }).click()
  const isDarkMode = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  expect(isDarkMode).toBe(true)

  await page.getByRole("radio", { name: "Светлая тема" }).click()
  isLightMode = await page.evaluate(
    () => !document.documentElement.classList.contains("dark"),
  )
  expect(isLightMode).toBe(true)
})

test("Selected mode is preserved across sessions", async ({ page }) => {
  await page.goto("/settings")
  await page.getByRole("tab", { name: "Настройка темы" }).click()

  // Ensure the initial state is light mode
  if (
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    )
  ) {
    await page.getByRole("radio", { name: "Светлая тема" }).click()
  }

  const isLightMode = await page.evaluate(
    () => !document.documentElement.classList.contains("dark"),
  )
  expect(isLightMode).toBe(true)

  await page.getByRole("radio", { name: "Темная тема" }).click()
  let isDarkMode = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  expect(isDarkMode).toBe(true)

  await logOutUser(page)
  await logInUser(page, firstSuperuser, firstSuperuserPassword)

  isDarkMode = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  expect(isDarkMode).toBe(true)
})

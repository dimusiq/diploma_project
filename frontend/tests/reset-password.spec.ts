import { expect, test } from "@playwright/test"
import { findLastEmail } from "./utils/mailcatcher"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, signUpNewUser } from "./utils/user"

test.describe
  .serial("reset-password", () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test("Password Recovery title is visible", async ({ page }) => {
      await page.goto("/recover-password")

      await expect(
        page.getByRole("heading", { name: "Восстановление пароля" }),
      ).toBeVisible()
    })

    test("Input is visible, empty and editable", async ({ page }) => {
      await page.goto("/recover-password")

      await expect(page.getByPlaceholder("Email")).toBeVisible()
      await expect(page.getByPlaceholder("Email")).toHaveText("")
      await expect(page.getByPlaceholder("Email")).toBeEditable()
    })

    test("Continue button is visible", async ({ page }) => {
      await page.goto("/recover-password")

      await expect(
        page.getByRole("button", { name: "Продолжить" }),
      ).toBeVisible()
    })

    test("User can reset password successfully using the link", async ({
      page,
      request,
    }) => {
      const fullName = "Test User"
      const email = randomEmail()
      const password = randomPassword()
      const newPassword = randomPassword()

      await signUpNewUser(page, fullName, email, password)

      await page.goto("/recover-password")
      await page.getByPlaceholder("Email").fill(email)

      await page.getByRole("button", { name: "Продолжить" }).click()

      const emailData = await findLastEmail({
        request,
        filter: (e) => e.recipients.includes(`<${email}>`),
        timeout: 20_000,
      })

      await page.goto(
        `${process.env.MAILCATCHER_HOST}/messages/${emailData.id}.html`,
      )

      const selector = 'a[href*="/reset-password?token="]'

      let url = await page.getAttribute(selector, "href")

      url = url!.replace("http://localhost/", "http://localhost:5173/")

      await page.goto(url)

      await page.getByPlaceholder("Новый пароль").fill(newPassword)
      await page.getByPlaceholder("Подтвердите пароль").fill(newPassword)
      await page.getByRole("button", { name: "Сбросить пароль" }).click()
      await expect(page.getByText("Пароль успешно изменен.")).toBeVisible()

      await logInUser(page, email, newPassword)
    })

    test("Expired or invalid reset link", async ({ page }) => {
      const password = randomPassword()
      const invalidUrl = "/reset-password?token=invalidtoken"

      await page.goto(invalidUrl)

      await page.getByPlaceholder("Новый пароль").fill(password)
      await page.getByPlaceholder("Подтвердите пароль").fill(password)
      await page.getByRole("button", { name: "Сбросить пароль" }).click()

      await expect(page.getByText("Invalid token")).toBeVisible()
    })

    test("Weak new password validation", async ({ page, request }) => {
      const fullName = "Test User"
      const email = randomEmail()
      const password = randomPassword()
      const weakPassword = "123"

      await signUpNewUser(page, fullName, email, password)

      await page.goto("/recover-password")
      await page.getByPlaceholder("Email").fill(email)
      await page.getByRole("button", { name: "Продолжить" }).click()

      const emailData = await findLastEmail({
        request,
        filter: (e) => e.recipients.includes(`<${email}>`),
        timeout: 20_000,
      })

      await page.goto(
        `${process.env.MAILCATCHER_HOST}/messages/${emailData.id}.html`,
      )

      const selector = 'a[href*="/reset-password?token="]'
      let url = await page.getAttribute(selector, "href")
      url = url!.replace("http://localhost/", "http://localhost:5173/")

      await page.goto(url)
      await page.getByPlaceholder("Новый пароль").fill(weakPassword)
      await page.getByPlaceholder("Подтвердите пароль").fill(weakPassword)
      await page.getByRole("button", { name: "Сбросить пароль" }).click()

      await expect(
        page.getByText("Пароль должен содержать не менее 8 символов"),
      ).toBeVisible()
    })
  })

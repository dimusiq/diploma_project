import { test as setup } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

const authFile = "playwright/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill(firstSuperuser)
  await page.getByPlaceholder("Пароль").fill(firstSuperuserPassword)
  await page.getByRole("button", { name: "Войти" }).click()
  await page.waitForURL("**/control-tower")
  // Токен по умолчанию в sessionStorage — Playwright сохраняет в storageState только localStorage.
  await page.evaluate(() => {
    const key = "access_token"
    const t = sessionStorage.getItem(key)
    if (t) {
      localStorage.setItem(key, t)
      sessionStorage.removeItem(key)
    }
  })
  await page.context().storageState({ path: authFile })
})

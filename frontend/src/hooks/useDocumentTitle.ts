import { useEffect } from "react"

const APP_TITLE = "Склад"

const PATH_TITLES: Record<string, string> = {
  "/": "Дашборд",
  "/items": "Поступления",
  "/warehouse": "Товары",
  "/warehouse-3d": "3D Склад",
  "/warehouse-3d-help": "Справка 3D",
  "/shipment": "Отгрузка",
  "/shipped": "Отгружено",
  "/technique": "Техника",
  "/settings": "Настройки",
  "/admin": "Администрирование",
  "/login": "Вход",
  "/signup": "Регистрация",
  "/recover-password": "Восстановление пароля",
  "/reset-password": "Сброс пароля",
}

function getTitleForPath(pathname: string): string {
  const base = pathname.split("/").filter(Boolean)[0]
  const path = base ? `/${base}` : "/"
  const segment = PATH_TITLES[path]
  return segment ? `${segment} — ${APP_TITLE}` : APP_TITLE
}

/**
 * Устанавливает document.title в зависимости от pathname.
 * Использует возможности React 19 и TanStack Router для обновления при смене маршрута.
 */
export function useDocumentTitle(pathname: string) {
  useEffect(() => {
    document.title = getTitleForPath(pathname)
  }, [pathname])
}

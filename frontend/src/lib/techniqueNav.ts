/** Навигация раздела «Техника»: процесс ТО, без второго списка оборудования. */

export type TechniqueTab = {
  id: string
  label: string
  path: string
}

export function techniqueProcessHeading(pathname: string): string {
  if (
    pathname.startsWith("/technique/work-orders") ||
    pathname.startsWith("/technique/technicians")
  ) {
    return "Наряды"
  }
  if (
    pathname.startsWith("/technique/analytics") ||
    pathname.startsWith("/technique/predictive")
  ) {
    return "Аналитика"
  }
  if (pathname.startsWith("/technique/equipment")) return "Карточка ТО"
  if (pathname.startsWith("/technique/integrations")) return "Интеграции"
  if (pathname.startsWith("/technique/security")) return "Безопасность"
  return "ТО"
}

export function techniqueSectionTabs(pathname: string): TechniqueTab[] {
  if (
    pathname.startsWith("/technique/work-orders") ||
    pathname.startsWith("/technique/technicians")
  ) {
    return [
      { id: "work-orders", label: "Наряды", path: "/technique/work-orders" },
      { id: "technicians", label: "Техники", path: "/technique/technicians" },
    ]
  }
  if (
    pathname.startsWith("/technique/analytics") ||
    pathname.startsWith("/technique/predictive")
  ) {
    return [
      { id: "analytics", label: "Аналитика", path: "/technique/analytics" },
      { id: "predictive", label: "Прогнозирование", path: "/technique/predictive" },
    ]
  }
  if (pathname.startsWith("/technique/equipment")) return []
  if (
    pathname.startsWith("/technique/integrations") ||
    pathname.startsWith("/technique/security")
  ) {
    return []
  }
  return [
    { id: "maintenance", label: "График", path: "/technique/maintenance" },
    { id: "calendar", label: "Календарь", path: "/technique/maintenance-schedule" },
    { id: "settings", label: "Настройки", path: "/technique/maintenance-settings" },
    { id: "alerts", label: "Мониторинг", path: "/technique/alerts" },
    { id: "spare-parts", label: "Запчасти", path: "/technique/spare-parts" },
  ]
}

export function isTechniqueTabActive(tabPath: string, pathname: string): boolean {
  return pathname === tabPath || pathname.startsWith(`${tabPath}/`)
}

/** Подсветка пунктов sidebar «Техника». */
export function isTechniqueSidebarItemActive(
  itemPath: string,
  pathname: string,
): boolean {
  if (itemPath === "/equipment") {
    return pathname === "/equipment" || pathname.startsWith("/equipment/")
  }
  if (itemPath === "/technique/maintenance") {
    return (
      pathname.startsWith("/technique/maintenance") ||
      pathname.startsWith("/technique/alerts") ||
      pathname.startsWith("/technique/spare-parts") ||
      pathname.startsWith("/technique/equipment")
    )
  }
  if (itemPath === "/technique/work-orders") {
    return (
      pathname.startsWith("/technique/work-orders") ||
      pathname.startsWith("/technique/technicians")
    )
  }
  if (itemPath === "/technique/analytics") {
    return (
      pathname.startsWith("/technique/analytics") ||
      pathname.startsWith("/technique/predictive")
    )
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

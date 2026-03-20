import { Box, Link, Text } from "@chakra-ui/react"
import { Link as RouterLink, useLocation } from "@tanstack/react-router"

interface Crumb {
  label: string
  to?: string
}

const PATH_LABELS: Record<string, string> = {
  "/": "Главная",
  "/items": "Поступления",
  "/warehouse": "Склад",
  "/warehouse-twin": "Аналитика двойника",
  "/warehouse-3d": "3D Склад",
  "/assistant": "Ассистент",
  "/shipment": "Отгрузка",
  "/shipped": "Отгружено",
  "/technique": "Техника",
  "/settings": "Настройки",
  "/admin": "Администрирование",
}

/** Подразделы «Техника» для хлебных крошек (section → заголовок). */
const TECHNIQUE_SECTION_LABELS: Record<string, string> = {
  assets: "Список техники",
  maintenance: "График ТО",
  "maintenance-schedule": "Календарь ТО",
  "maintenance-settings": "Настройка ТО",
  "work-orders": "Обслуживание и ремонт техники",
  technicians: "Управление задачами техников",
  alerts: "Мониторинг и уведомления",
  "spare-parts": "Запасные части",
  analytics: "Аналитика",
  integrations: "Интеграции",
  security: "Безопасность",
  predictive: "Прогнозирование",
}

function pathToCrumbs(pathname: string, search?: { section?: string }): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: Crumb[] = [{ label: PATH_LABELS["/"] ?? "Главная", to: "/" }]
  let acc = ""
  for (const seg of segments) {
    acc += `/${seg}`
    const label =
      PATH_LABELS[acc] ??
      (seg.length > 10 ? `${seg.slice(0, 8)}…` : decodeURIComponent(seg))
    crumbs.push({ label, to: acc })
  }
  if (pathname === "/technique" && search?.section && TECHNIQUE_SECTION_LABELS[search.section]) {
    crumbs.push({
      label: TECHNIQUE_SECTION_LABELS[search.section],
      to: undefined,
    })
  }
  return crumbs
}

interface BreadcrumbsProps {
  extra?: Crumb[]
}

export function Breadcrumbs({ extra = [] }: BreadcrumbsProps) {
  const location = useLocation()
  const pathname = location.pathname
  const section = new URLSearchParams(location.search).get("section") ?? undefined
  const baseCrumbs = pathToCrumbs(pathname, section ? { section } : undefined)
  const crumbs =
    extra.length > 0 ? [...baseCrumbs.slice(0, -1), ...extra] : baseCrumbs
  if (crumbs.length <= 1) return null

  return (
    <Box
      as="nav"
      aria-label="Хлебные крошки"
      fontSize="sm"
      color="gray.600"
      mb={2}
      display="flex"
      flexWrap="wrap"
      gap={1}
      alignItems="center"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <Box key={crumb.to ?? crumb.label} display="flex" alignItems="center" gap={1}>
            {i > 0 && <Text as="span">/</Text>}
            {isLast || !crumb.to ? (
              <Text as="span" aria-current="page">
                {crumb.label}
              </Text>
            ) : (
              <Link asChild>
                <RouterLink to={crumb.to}>{crumb.label}</RouterLink>
              </Link>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

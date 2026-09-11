import { Link as RouterLink, useLocation } from "@tanstack/react-router"

interface Crumb {
  label: string
  to?: string
}

/** Известные пути первого уровня и полные пути без вложенной логики. */
const PATH_LABELS: Record<string, string> = {
  "/": "Главная",
  "/dashboard": "Дашборд",
  "/items": "Поступления",
  "/inbound-orders": "Входящие заказы",
  "/outbound-orders": "Исходящие заказы",
  "/warehouse": "Склад",
  "/warehouse-tasks": "Задания склада",
  "/warehouse-twin": "Аналитика двойника",
  "/warehouse-simulation": "Симуляция и аналитика",
  "/warehouse-3d": "3D Склад",
  "/warehouse-3d-help": "Справка 3D",
  "/assistant": "Ассистент",
  "/shipment": "Отгрузка",
  "/shipped": "Отгружено",
  "/technique": "Список техники",
  "/technique/equipment": "Оборудование",
  "/settings": "Настройки",
  "/admin": "Администрирование",
  "/control-tower": "Control Tower",
}

/** Сегмент пути после `/technique/` → подпись (вложенные маршруты техники). */
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

const UUID_TAIL_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function labelForTechniqueTail(rest: string): string | undefined {
  if (rest === "equipment/new") return "Новая техника"
  const eq = /^equipment\/(.+)$/.exec(rest)
  if (eq) {
    const id = eq[1]
    if (id === "new") return "Новая техника"
    if (UUID_TAIL_RE.test(id)) return `Единица (${id.slice(0, 8)}…)`
    return `Единица (${id})`
  }
  return TECHNIQUE_SECTION_LABELS[rest]
}

/**
 * Человекочитаемая подпись для накопленного пути `acc` (например `/technique/maintenance`).
 */
function getPathLabel(acc: string): string {
  const known = PATH_LABELS[acc]
  if (known) return known

  if (acc.startsWith("/technique/")) {
    const rest = acc.slice("/technique/".length)
    const techniqueLabel = labelForTechniqueTail(rest)
    if (techniqueLabel) return techniqueLabel
  }

  const segments = acc.split("/").filter(Boolean)
  const last = segments[segments.length - 1] ?? acc
  const decoded = decodeURIComponent(last)
  return decoded.length > 24 ? `${decoded.slice(0, 22)}…` : decoded
}

function pathToCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: Crumb[] = [{ label: PATH_LABELS["/"] ?? "Главная", to: "/" }]
  let acc = ""
  for (const seg of segments) {
    acc += `/${seg}`
    const label = getPathLabel(acc)
    crumbs.push({ label, to: acc })
  }
  return crumbs
}

interface BreadcrumbsProps {
  extra?: Crumb[]
}

export function Breadcrumbs({ extra = [] }: BreadcrumbsProps) {
  const location = useLocation()
  const pathname = location.pathname
  const baseCrumbs = pathToCrumbs(pathname)
  const crumbs =
    extra.length > 0 ? [...baseCrumbs.slice(0, -1), ...extra] : baseCrumbs
  if (crumbs.length <= 1) return null

  return (
    <nav
      aria-label="Хлебные крошки"
      className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <div
            key={`${crumb.to ?? ""}-${crumb.label}-${i}`}
            className="flex items-center gap-1"
          >
            {i > 0 ? <span aria-hidden>/</span> : null}
            {isLast || !crumb.to ? (
              <span className="text-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <RouterLink
                to={crumb.to}
                className="text-primary underline-offset-4 hover:underline"
              >
                {crumb.label}
              </RouterLink>
            )}
          </div>
        )
      })}
    </nav>
  )
}

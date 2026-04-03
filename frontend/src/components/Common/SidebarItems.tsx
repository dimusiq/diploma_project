import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useLocation } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  FiActivity,
  FiArrowDownRight,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiChevronDown,
  FiCpu,
  FiGrid,
  FiLayers,
  FiList,
  FiMessageCircle,
  FiSettings,
  FiTarget,
  FiTruck,
  FiUsers,
} from "react-icons/fi"
import type { IconType } from "react-icons/lib"
import { TbForklift } from "react-icons/tb"
import { fetchAgentPermissions } from "@/api/agent.ts"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { cn } from "@/lib/utils"

interface SubItem {
  id: string
  title: string
}

interface ItemBase {
  icon: IconType
  title: string
}
interface ItemLink extends ItemBase {
  path: string
  children?: never
}
interface ItemExpandable extends ItemBase {
  path: null
  children: SubItem[]
}
type Item = ItemLink | ItemExpandable

const items: Item[] = [
  { icon: FiBarChart2, title: "Дашборд", path: "/" },
  { icon: FiGrid, title: "Центр платформы", path: "/operator-hub" },
  { icon: FiTarget, title: "Control Tower", path: "/control-tower" },
  { icon: FiArrowDownRight, title: "Поступления", path: "/items" },
  { icon: FiBox, title: "Склад", path: "/warehouse" },
  { icon: FiList, title: "Задания склада", path: "/warehouse-tasks" },
  { icon: FiActivity, title: "Аналитика двойника", path: "/warehouse-twin" },
  {
    icon: FiCpu,
    title: "Симуляция и аналитика",
    path: "/warehouse-simulation",
  },
  { icon: FiLayers, title: "3D Склад", path: "/warehouse-3d" },
  { icon: FiMessageCircle, title: "Ассистент", path: "/assistant" },
  { icon: FiTruck, title: "Отгрузка", path: "/shipment" },
  { icon: FiCheckCircle, title: "Отгружено", path: "/shipped" },
  {
    icon: TbForklift,
    title: "Техника",
    path: null as null,
    children: [
      { id: "assets", title: "Список техники" },
      { id: "maintenance", title: "График ТО" },
      { id: "maintenance-schedule", title: "Календарь ТО" },
      { id: "maintenance-settings", title: "Настройка ТО" },
      { id: "work-orders", title: "Обслуживание и ремонт техники" },
      { id: "technicians", title: "Управление задачами техников" },
      { id: "alerts", title: "Мониторинг и уведомления" },
      { id: "spare-parts", title: "Запасные части" },
      { id: "analytics", title: "Аналитика" },
      { id: "integrations", title: "Интеграции" },
      { id: "security", title: "Безопасность" },
      { id: "predictive", title: "Прогнозирование" },
    ],
  },
  { icon: FiSettings, title: "Настройки Пользователя", path: "/settings" },
]

interface SidebarItemsProps {
  onClose?: () => void
}

function isExpandable(item: Item): item is ItemExpandable {
  return item.path === null && "children" in item && item.children != null
}

const SidebarItems = ({ onClose }: SidebarItemsProps) => {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const pathname = location.pathname
  const [techniqueExpanded, setTechniqueExpanded] = useState(false)

  const currentSection =
    pathname === "/technique"
      ? location.search &&
        typeof location.search === "object" &&
        "section" in location.search
        ? (location.search as { section?: string }).section
        : "assets"
      : undefined

  useEffect(() => {
    if (pathname === "/technique") setTechniqueExpanded(true)
  }, [pathname])

  const finalItems: Item[] = currentUser?.is_superuser
    ? [
        ...items,
        {
          icon: FiUsers,
          title: "Администрирование",
          path: "/admin",
        },
      ]
    : items

  const { data: agentPerm, isPending: agentPermPending } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
  })

  const navItems = finalItems.filter((item) => {
    if (!isExpandable(item) && item.path === "/assistant") {
      if (agentPermPending) return false
      return agentPerm?.can_use === true
    }
    return true
  })

  const listItems = navItems.map((item) => {
    if (isExpandable(item)) {
      const Icon = item.icon
      return (
        <Collapsible
          key={item.title}
          open={techniqueExpanded}
          onOpenChange={setTechniqueExpanded}
        >
          <CollapsibleTrigger className="flex w-full items-center gap-4 rounded-md px-4 py-2 text-left text-sm text-foreground hover:bg-muted">
            <Icon className="size-4 shrink-0 self-center" aria-hidden />
            <span className="ml-2">{item.title}</span>
            <FiChevronDown
              className={cn(
                "ml-auto size-4 shrink-0 transition-transform",
                techniqueExpanded ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-2 pb-1 pl-6">
              {item.children.map((sub) => {
                const isActive = currentSection === sub.id
                return (
                  <RouterLink
                    key={sub.id}
                    to="/technique"
                    search={{ section: sub.id }}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted",
                      isActive &&
                        "border-l-[3px] border-primary bg-muted font-bold",
                      !isActive && "font-medium",
                    )}
                  >
                    {sub.title}
                  </RouterLink>
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )
    }
    const { icon: Icon, title, path } = item
    const isActive = pathname === path || (path === "/" && pathname === "/")
    return (
      <RouterLink key={title} to={path} onClick={onClose}>
        <div
          className={cn(
            "flex items-center gap-4 rounded-md px-4 py-2 text-sm hover:bg-muted",
            isActive && "border-l-[3px] border-primary bg-muted font-bold",
            !isActive && "font-normal",
          )}
        >
          <Icon className="size-4 shrink-0 self-center" aria-hidden />
          <span className="ml-2">{title}</span>
        </div>
      </RouterLink>
    )
  })

  return (
    <>
      <p className="px-4 py-2 text-xs font-bold text-muted-foreground">Меню</p>
      <div>{listItems}</div>
    </>
  )
}

export default SidebarItems

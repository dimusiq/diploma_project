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
  FiDownload,
  FiLayers,
  FiList,
  FiMessageCircle,
  FiSettings,
  FiTarget,
  FiTruck,
  FiUpload,
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
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  sidebarMenuButtonVariants,
} from "@/components/ui/sidebar.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { cn } from "@/lib/utils"

interface SubItem {
  path: string
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

const operationsItems: Item[] = [
  { icon: FiArrowDownRight, title: "Поступления", path: "/items" },
  { icon: FiDownload, title: "Входящие заказы", path: "/inbound-orders" },
  { icon: FiBox, title: "Склад", path: "/warehouse" },
  { icon: FiList, title: "Задания склада", path: "/warehouse-tasks" },
  { icon: FiUpload, title: "Исходящие заказы", path: "/outbound-orders" },
  { icon: FiTruck, title: "Отгрузка", path: "/shipment" },
  { icon: FiCheckCircle, title: "Отгружено", path: "/shipped" },
]

const analyticsItems: Item[] = [
  { icon: FiBarChart2, title: "Дашборд", path: "/" },
  { icon: FiTarget, title: "Control Tower", path: "/control-tower" },
  { icon: FiActivity, title: "Аналитика двойника", path: "/warehouse-twin" },
  {
    icon: FiCpu,
    title: "Симуляция и аналитика",
    path: "/warehouse-simulation",
  },
  { icon: FiLayers, title: "3D Склад", path: "/warehouse-3d" },
]

const managementItemsBase: Item[] = [
  {
    icon: TbForklift,
    title: "Техника",
    path: null as null,
    children: [
      { path: "/technique", title: "Список техники" },
      { path: "/technique/maintenance", title: "График ТО" },
      { path: "/technique/maintenance-schedule", title: "Календарь ТО" },
      { path: "/technique/maintenance-settings", title: "Настройка ТО" },
      { path: "/technique/work-orders", title: "Обслуживание и ремонт техники" },
      { path: "/technique/technicians", title: "Управление задачами техников" },
      { path: "/technique/alerts", title: "Мониторинг и уведомления" },
      { path: "/technique/spare-parts", title: "Запасные части" },
      { path: "/technique/analytics", title: "Аналитика" },
      { path: "/technique/integrations", title: "Интеграции" },
      { path: "/technique/security", title: "Безопасность" },
      { path: "/technique/predictive", title: "Прогнозирование" },
    ],
  },
  { icon: FiMessageCircle, title: "Ассистент", path: "/assistant" },
  { icon: FiSettings, title: "Настройки Пользователя", path: "/settings" },
]

interface SidebarItemsProps {
  onNavigate?: () => void
}

function isExpandable(item: Item): item is ItemExpandable {
  return item.path === null && "children" in item && item.children != null
}

function SidebarItems({ onNavigate }: SidebarItemsProps) {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const pathname = location.pathname
  const [techniqueExpanded, setTechniqueExpanded] = useState(false)

  useEffect(() => {
    if (pathname.startsWith("/technique")) setTechniqueExpanded(true)
  }, [pathname])

  const { data: agentPerm, isPending: agentPermPending } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
  })

  const managementItems: Item[] = (() => {
    const base = managementItemsBase.filter((item) => {
      if (!isExpandable(item) && item.path === "/assistant") {
        if (agentPermPending) return false
        return agentPerm?.can_use === true
      }
      return true
    })
    if (currentUser?.is_superuser) {
      return [
        ...base,
        { icon: FiUsers, title: "Администрирование", path: "/admin" as const },
      ]
    }
    return base
  })()

  const renderItem = (item: Item) => {
    if (isExpandable(item)) {
      const Icon = item.icon
      return (
        <SidebarMenuItem key={item.title}>
          <Collapsible
            open={techniqueExpanded}
            onOpenChange={setTechniqueExpanded}
            className="group/collapsible w-full min-w-0"
          >
            <CollapsibleTrigger
              type="button"
              className={cn(
                sidebarMenuButtonVariants({
                  variant: "default",
                  size: "default",
                }),
                "w-full",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>{item.title}</span>
              <FiChevronDown
                className={cn(
                  "ml-auto size-4 shrink-0 transition-transform",
                  techniqueExpanded ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.children.map((sub) => {
                  const isActive =
                    sub.path === "/technique"
                      ? pathname === "/technique" || pathname === "/technique/"
                      : pathname === sub.path || pathname.startsWith(`${sub.path}/`)
                  return (
                    <SidebarMenuSubItem key={sub.path}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={isActive}
                        size="md"
                      >
                        <RouterLink to={sub.path} onClick={onNavigate}>
                          <span>{sub.title}</span>
                        </RouterLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        </SidebarMenuItem>
      )
    }
    const { icon: Icon, title, path } = item
    const isActive = pathname === path || (path === "/" && pathname === "/")
    return (
      <SidebarMenuItem key={title}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={title}>
          <RouterLink to={path} onClick={onNavigate}>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{title}</span>
          </RouterLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Операции</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{operationsItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Аналитика</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{analyticsItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Управление</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{managementItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}

export default SidebarItems

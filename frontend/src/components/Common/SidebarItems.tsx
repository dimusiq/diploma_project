import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useLocation } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  FiArrowDownRight,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiChevronDown,
  FiCpu,
  FiDownload,
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
  {
    icon: FiBox,
    title: "Склад",
    path: null,
    children: [
      { path: "/warehouse", title: "Остатки" },
      { path: "/warehouse-tasks", title: "Задания" },
      { path: "/warehouse-3d", title: "3D модель" },
      { path: "/warehouse-twin", title: "Twin" },
    ],
  },
  { icon: FiUpload, title: "Исходящие заказы", path: "/outbound-orders" },
  { icon: FiTruck, title: "Отгрузка", path: "/shipment" },
  { icon: FiCheckCircle, title: "Отгружено", path: "/shipped" },
]

const analyticsItems: Item[] = [
  { icon: FiBarChart2, title: "Дашборд", path: "/" },
  { icon: FiTarget, title: "Control Tower", path: "/control-tower" },
  {
    icon: FiCpu,
    title: "Симуляция",
    path: "/warehouse-simulation",
  },
]

const managementItemsBase: Item[] = [
  {
    icon: TbForklift,
    title: "Техника",
    path: null,
    children: [
      { path: "/technique", title: "Парк" },
      { path: "/technique/maintenance", title: "ТО" },
      { path: "/technique/work-orders", title: "Наряды" },
      { path: "/technique/analytics", title: "Аналитика" },
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

function groupShouldOpen(item: ItemExpandable, pathname: string): boolean {
  return item.children.some((sub) =>
    sub.path === "/technique"
      ? pathname === "/technique" || pathname.startsWith("/technique/")
      : pathname === sub.path || pathname.startsWith(`${sub.path}/`),
  )
}

function SidebarItems({ onNavigate }: SidebarItemsProps) {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const pathname = location.pathname
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev }
      for (const item of [...operationsItems, ...managementItemsBase]) {
        if (isExpandable(item) && groupShouldOpen(item, pathname)) {
          next[item.title] = true
        }
      }
      return next
    })
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
      const expanded = Boolean(openGroups[item.title])
      return (
        <SidebarMenuItem key={item.title}>
          <Collapsible
            open={expanded}
            onOpenChange={(open) =>
              setOpenGroups((prev) => ({ ...prev, [item.title]: open }))
            }
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
                  expanded ? "rotate-0" : "-rotate-90",
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
                      : pathname === sub.path ||
                        pathname.startsWith(`${sub.path}/`)
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

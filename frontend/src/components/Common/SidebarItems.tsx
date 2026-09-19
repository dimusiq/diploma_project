import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useLocation } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  FiActivity,
  FiArrowDownRight,
  FiBarChart2,
  FiBox,
  FiChevronDown,
  FiCpu,
  FiLayers,
  FiMessageCircle,
  FiRadio,
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
import { canAccessWarehouseSim } from "@/lib/warehouseSimAccess.ts"

interface SubItem {
  path: string
  title: string
  search?: Record<string, string>
}

interface ItemBase {
  icon: IconType
  title: string
}
interface ItemLink extends ItemBase {
  path: string
  search?: Record<string, string>
  children?: never
}
interface ItemExpandable extends ItemBase {
  path: null
  children: SubItem[]
}
type Item = ItemLink | ItemExpandable

const controlItems: Item[] = [
  { icon: FiTarget, title: "Control Tower", path: "/control-tower" },
  { icon: FiLayers, title: "Digital Twin", path: "/digital-twin" },
  { icon: FiBarChart2, title: "Дашборд", path: "/" },
]

const operationsItems: Item[] = [
  { icon: FiArrowDownRight, title: "Приёмка", path: "/items" },
  {
    icon: FiBox,
    title: "Заказы",
    path: null,
    children: [
      { path: "/inbound-orders", title: "Входящие" },
      { path: "/outbound-orders", title: "Исходящие" },
    ],
  },
  {
    icon: FiBox,
    title: "Склад",
    path: null,
    children: [
      { path: "/warehouse", title: "Остатки" },
      { path: "/warehouse-tasks", title: "Задания" },
    ],
  },
  {
    icon: FiTruck,
    title: "Отгрузка",
    path: null,
    children: [
      { path: "/shipment", title: "К отгрузке" },
      { path: "/shipped", title: "Отгружено" },
    ],
  },
]

const monitoringItems: Item[] = [
  {
    icon: FiActivity,
    title: "События",
    path: "/digital-twin",
    search: { tab: "events", view: "2d" },
  },
]

const simulationItems: Item[] = [
  {
    icon: FiCpu,
    title: "Simulation Lab",
    path: "/warehouse-simulation",
  },
]

const managementItemsBase: Item[] = [
  {
    icon: TbForklift,
    title: "Техника",
    path: null,
    children: [
      { path: "/equipment", title: "Оборудование" },
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

function pathIsActive(
  path: string,
  pathname: string,
  search?: Record<string, string>,
  currentSearch?: Record<string, unknown>,
): boolean {
  const pathMatch =
    path === "/"
      ? pathname === "/"
      : pathname === path || pathname.startsWith(`${path}/`)
  if (!pathMatch) return false
  if (!search) {
    if (path === "/digital-twin" && currentSearch?.tab === "events") {
      return false
    }
    return true
  }
  return Object.entries(search).every(
    ([key, value]) => currentSearch?.[key] === value,
  )
}

function SidebarItems({ onNavigate }: SidebarItemsProps) {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const pathname = location.pathname
  const search = location.search as Record<string, unknown>
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

  const managementItems: Item[] = managementItemsBase.filter((item) => {
    if (!isExpandable(item) && item.path === "/assistant") {
      if (agentPermPending) return false
      return agentPerm?.can_use === true
    }
    return true
  })

  const adminItems: Item[] = []
  if (canAccessWarehouseSim(currentUser)) {
    adminItems.push({
      icon: FiRadio,
      title: "Device Monitor",
      path: "/device-server",
    })
  }
  if (currentUser?.is_superuser) {
    adminItems.push({
      icon: FiUsers,
      title: "Администрирование",
      path: "/admin",
    })
  }

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
    const { icon: Icon, title, path, search: itemSearch } = item
    const isActive = pathIsActive(path, pathname, itemSearch, search)
    return (
      <SidebarMenuItem key={`${title}-${path}-${itemSearch?.tab ?? ""}`}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={title}>
          <RouterLink
            to={path}
            search={itemSearch}
            onClick={onNavigate}
          >
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
        <SidebarGroupLabel>Контроль</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{controlItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Операции</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{operationsItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Мониторинг</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{monitoringItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Симуляция</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{simulationItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Управление</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{managementItems.map(renderItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {adminItems.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{adminItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  )
}

export default SidebarItems

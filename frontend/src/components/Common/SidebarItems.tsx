import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink, useLocation } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { fetchAgentPermissions } from "@/api/agent.ts"
import {
  FiActivity,
  FiArrowDownRight,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCpu,
  FiLayers,
  FiList,
  FiMessageCircle,
  FiSettings,
  FiTruck,
  FiUsers,
  FiTarget,
} from "react-icons/fi"
import type { IconType } from "react-icons/lib"
import { TbForklift } from "react-icons/tb"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"

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
  {
    icon: FiBarChart2,
    title: "Дашборд",
    path: "/",
  },
  {
    icon: FiTarget,
    title: "Control Tower",
    path: "/control-tower",
  },
  {
    icon: FiArrowDownRight,
    title: "Поступления",
    path: "/items",
  },
  {
    icon: FiBox,
    title: "Склад",
    path: "/warehouse",
  },
  {
    icon: FiList,
    title: "Задания склада",
    path: "/warehouse-tasks",
  },
  {
    icon: FiActivity,
    title: "Аналитика двойника",
    path: "/warehouse-twin",
  },
  {
    icon: FiCpu,
    title: "Симуляция и аналитика",
    path: "/warehouse-simulation",
  },
  {
    icon: FiLayers,
    title: "3D Склад",
    path: "/warehouse-3d",
  },
  {
    icon: FiMessageCircle,
    title: "Ассистент",
    path: "/assistant",
  },
  {
    icon: FiTruck,
    title: "Отгрузка",
    path: "/shipment",
  },
  {
    icon: FiCheckCircle,
    title: "Отгружено",
    path: "/shipped",
  },
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
  {
    icon: FiSettings,
    title: "Настройки Пользователя",
    path: "/settings",
  },
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
      ? location.search && typeof location.search === "object" && "section" in location.search
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
          title: 'Администрирование',
          path: '/admin',
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
      return (
        <Box key={item.title}>
          <Flex
            as="button"
            gap={4}
            px={4}
            py={2}
            w="100%"
            textAlign="left"
            _hover={{ background: "gray.subtle" }}
            alignItems="center"
            fontSize="sm"
            onClick={() => setTechniqueExpanded((v) => !v)}
          >
            <Icon as={item.icon} alignSelf="center" />
            <Text ml={2}>{item.title}</Text>
            <Icon
              as={techniqueExpanded ? FiChevronDown : FiChevronRight}
              ml="auto"
              boxSize={4}
            />
          </Flex>
          {techniqueExpanded && (
            <Box pl={6} pr={2} pb={1}>
              {item.children.map((sub) => {
                const isActive = currentSection === sub.id
                return (
                  <RouterLink
                    key={sub.id}
                    to="/technique"
                    search={{ section: sub.id }}
                    onClick={onClose}
                  >
                    <Flex
                      gap={2}
                      px={2}
                      py={1.5}
                      _hover={{ background: "gray.subtle" }}
                      alignItems="center"
                      fontSize="xs"
                      borderRadius="md"
                      bg={isActive ? "gray.subtle" : undefined}
                      fontWeight={isActive ? "bold" : "medium"}
                      borderLeftWidth={isActive ? "3px" : 0}
                      borderLeftColor="blue.500"
                    >
                      <Text>{sub.title}</Text>
                    </Flex>
                  </RouterLink>
                )
              })}
            </Box>
          )}
        </Box>
      )
    }
    const { icon, title, path } = item
    const isActive = pathname === path || (path === "/" && pathname === "/")
    return (
      <RouterLink key={title} to={path} onClick={onClose}>
        <Flex
          gap={4}
          px={4}
          py={2}
          _hover={{ background: "gray.subtle" }}
          alignItems="center"
          fontSize="sm"
          bg={isActive ? "gray.subtle" : undefined}
          fontWeight={isActive ? "bold" : undefined}
          borderLeftWidth={isActive ? "3px" : 0}
          borderLeftColor="blue.500"
        >
          <Icon as={icon} alignSelf="center" />
          <Text ml={2}>{title}</Text>
        </Flex>
      </RouterLink>
    )
  })

  return (
    <>
      <Text fontSize="xs" px={4} py={2} fontWeight="bold">
        Меню
      </Text>
      <Box>{listItems}</Box>
    </>
  )
}

export default SidebarItems

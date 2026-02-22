import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { Link as RouterLink } from "@tanstack/react-router"
import { useState } from "react"
import {
  FiArrowDownRight,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiLayers,
  FiSettings,
  FiTruck,
  FiUsers,
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
    icon: FiLayers,
    title: "3D Склад",
    path: "/warehouse-3d",
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
      { id: "maintenance-schedule", title: "Расписание ТО" },
      { id: "work-orders", title: "Рабочие заказы" },
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
  const [techniqueExpanded, setTechniqueExpanded] = useState(false)

  const finalItems: Item[] = currentUser?.is_superuser
    ? [
        ...items,
        {
          icon: FiUsers,
          title: "Панель Администрирования",
          path: "/admin",
        },
      ]
    : items

  const listItems = finalItems.map((item) => {
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
              {item.children.map((sub) => (
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
                  >
                    <Text fontWeight="medium">{sub.title}</Text>
                  </Flex>
                </RouterLink>
              ))}
            </Box>
          )}
        </Box>
      )
    }
    const { icon, title, path } = item
    return (
      <RouterLink key={title} to={path} onClick={onClose}>
        <Flex
          gap={4}
          px={4}
          py={2}
          _hover={{
            background: "gray.subtle",
          }}
          alignItems="center"
          fontSize="sm"
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

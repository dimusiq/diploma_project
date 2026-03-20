/**
 * Центр уведомлений: иконка-колокольчик, бейдж непрочитанных, выпадающая панель.
 */
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FaExclamationTriangle } from "react-icons/fa"
import { FiBell, FiCheck, FiClock, FiInfo, FiPackage } from "react-icons/fi"

import {
  type NotificationPublic,
  notificationsApi,
  SEVERITY_LABELS,
} from "@/api/notifications.ts"
import { MenuContent, MenuRoot, MenuTrigger } from "@/components/ui/menu.tsx"
import { useNotificationSse } from "@/hooks/useNotificationSse.ts"

const SEVERITY_ICON = {
  critical: FaExclamationTriangle,
  warning: FiClock,
  info: FiInfo,
} as const

const SEVERITY_COLOR = {
  critical: "red",
  warning: "orange",
  info: "blue",
} as const

function NotificationItem({
  item,
  onMarkRead,
}: {
  item: NotificationPublic
  onMarkRead: (id: string) => void
}) {
  const severity = (
    item.severity in SEVERITY_ICON ? item.severity : "info"
  ) as keyof typeof SEVERITY_ICON
  const Icon = SEVERITY_ICON[severity]
  const colorPalette = SEVERITY_COLOR[severity]

  return (
    <Box
      p={3}
      borderRadius="md"
      bg={item.is_read ? "transparent" : "gray.50"}
      _dark={{ bg: item.is_read ? "transparent" : "whiteAlpha.50" }}
      borderBottomWidth="1px"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
    >
      <Flex gap={2} align="flex-start" justify="space-between">
        <Flex gap={2} flex={1} minW={0}>
          <Box color={`${colorPalette}.500`} mt={0.5} flexShrink={0}>
            <Icon size={18} />
          </Box>
          <Box minW={0} flex={1}>
            <Text fontWeight="medium" fontSize="sm">
              {item.title}
            </Text>
            {item.body && (
              <Text fontSize="xs" color="fg.muted" mt={0.5}>
                {item.body}
              </Text>
            )}
            {item.source && (
              <Flex
                alignItems="center"
                gap={1.5}
                mt={1}
                fontSize="xs"
                color="fg.muted"
              >
                {item.source === "Склад" && (
                  <Box color="orange.500" title="Склад">
                    <FiPackage size={14} />
                  </Box>
                )}
                <Text>Источник: {item.source}</Text>
              </Flex>
            )}
          </Box>
        </Flex>
        <Flex align="center" gap={1} flexShrink={0}>
          <Badge
            size="sm"
            colorPalette={colorPalette}
            variant="solid"
            fontSize="2xs"
          >
            {SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ??
              item.severity}
          </Badge>
          {!item.is_read && (
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Отметить прочитанным"
              onClick={() => onMarkRead(item.id)}
            >
              <FiCheck />
            </IconButton>
          )}
        </Flex>
      </Flex>
    </Box>
  )
}

export function NotificationCenter() {
  const queryClient = useQueryClient()
  useNotificationSse()

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.getUnreadCount(),
  })
  const unreadCount = unreadData?.count ?? 0

  const { data: listData, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list({ limit: 100 }),
  })
  const notifications = listData?.data ?? []

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: () => notificationsApi.clearAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const ensureMutation = useMutation({
    mutationFn: () => notificationsApi.ensure(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const handleMenuOpenChange = (details: { open: boolean }) => {
    if (details.open) {
      ensureMutation.mutate()
    }
  }

  return (
    <MenuRoot onOpenChange={handleMenuOpenChange}>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          position="relative"
          aria-label="Уведомления"
          cursor="pointer"
          borderRadius="md"
          _hover={{ bg: "whiteAlpha.300" }}
          _active={{ bg: "whiteAlpha.400" }}
        >
          <Box as={FiBell} boxSize="5" />
          {unreadCount > 0 && (
            <Badge
              position="absolute"
              top="-2px"
              right="-2px"
              size="sm"
              colorPalette="red"
              variant="solid"
              borderRadius="full"
              minW="18px"
              h="18px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="2xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </MenuTrigger>
      <MenuContent width="400px" maxWidth="95vw" p={0}>
        <Box p={4} pb={2}>
          <Text fontWeight="bold" fontSize="md">
            Центр уведомлений
          </Text>
          <Text fontSize="sm" color="fg.muted" mt={1}>
            Сюда выводятся важные события по технике, складу и доступам.
          </Text>
        </Box>
        <Box maxH="360px" overflowY="auto">
          {isLoading ? (
            <Box p={4}>
              <Text fontSize="sm" color="fg.muted">
                Загрузка…
              </Text>
            </Box>
          ) : notifications.length === 0 ? (
            <Box p={4}>
              <Text fontSize="sm" color="fg.muted">
                Нет уведомлений
              </Text>
            </Box>
          ) : (
            <VStack align="stretch" gap={0}>
              {notifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onMarkRead={(id) => markReadMutation.mutate(id)}
                />
              ))}
            </VStack>
          )}
        </Box>
        {(notifications.length > 0 || unreadCount > 0) && (
          <Box
            p={2}
            borderTopWidth="1px"
            borderColor="border"
            display="flex"
            flexDirection="column"
            gap={1}
          >
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                width="100%"
                onClick={() => markAllReadMutation.mutate()}
                loading={markAllReadMutation.isPending}
              >
                Отметить все прочитанными
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              width="100%"
              colorPalette="red"
              onClick={() => clearAllMutation.mutate()}
              loading={clearAllMutation.isPending}
            >
              Очистить уведомления
            </Button>
          </Box>
        )}
      </MenuContent>
    </MenuRoot>
  )
}

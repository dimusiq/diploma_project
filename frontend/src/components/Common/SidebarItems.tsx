import { Box, Flex, Icon, Text } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from '@tanstack/react-router';
import {
  FiArrowDownRight,
  FiBox,
  FiCheckCircle,
  FiLayers,
  FiSettings,
  FiTruck,
  FiUsers,
  FiBarChart2,
} from 'react-icons/fi';
import type { IconType } from 'react-icons/lib';

import type { UserPublic } from '@/client';

const items = [
  {
    icon: FiBarChart2,
    title: 'Дашборд',
    path: '/',
  },
  {
    icon: FiArrowDownRight,
    title: 'Поступления',
    path: '/items',
  },
  {
    icon: FiBox,
    title: 'Склад',
    path: '/warehouse',
  },
  {
    icon: FiLayers,
    title: '3D Склад',
    path: '/warehouse-3d',
  },
  {
    icon: FiTruck,
    title: 'Отгрузка',
    path: '/shipment',
  },
  {
    icon: FiCheckCircle,
    title: 'Отгружено',
    path: '/shipped',
  },
  {
    icon: FiSettings,
    title: 'Настройки Пользователя',
    path: '/settings',
  },
];

interface SidebarItemsProps {
  onClose?: () => void;
}

interface Item {
  icon: IconType;
  title: string;
  path: string;
}

const SidebarItems = ({ onClose }: SidebarItemsProps) => {
  const queryClient = useQueryClient();
  const currentUser = queryClient.getQueryData<UserPublic>([
    'currentUser',
  ]);

  const finalItems: Item[] = currentUser?.is_superuser
    ? [
        ...items,
        {
          icon: FiUsers,
          title: 'Панель Администрирования',
          path: '/admin',
        },
      ]
    : items;

  const listItems = finalItems.map(
    ({ icon, title, path }) => (
      <RouterLink key={title} to={path} onClick={onClose}>
        <Flex
          gap={4}
          px={4}
          py={2}
          _hover={{
            background: 'gray.subtle',
          }}
          alignItems='center'
          fontSize='sm'
        >
          <Icon as={icon} alignSelf='center' />
          <Text ml={2}>{title}</Text>
        </Flex>
      </RouterLink>
    )
  );

  return (
    <>
      <Text fontSize='xs' px={4} py={2} fontWeight='bold'>
        Меню
      </Text>
      <Box>{listItems}</Box>
    </>
  );
};

export default SidebarItems;

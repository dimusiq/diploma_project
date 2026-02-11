import {
  Box,
  Card,
  Container,
  Heading,
  Link,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import {
  Stat,
  StatLabel,
  StatHelpText,
} from '@chakra-ui/stat';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link as RouterLink, redirect } from '@tanstack/react-router';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { FiArrowDownRight, FiBox, FiCheckCircle, FiTruck } from 'react-icons/fi';

import { DashboardService } from '@/client';

interface LatestIncomingItem {
  id: string;
  title: string;
  created_at: string;
  status?: string;
}

interface DashboardStats {
  total_items: number;
  total_users: number;
  status_distribution: Record<string, number>;
  top_owners: Array<{ owner_email?: string; item_count?: number }>;
  latest_incoming?: LatestIncomingItem[];
}

export const Route = createFileRoute('/_layout/dashboard')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
  component: () => null,
});

export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () =>
      (await DashboardService.getDashboardStats()) as unknown as DashboardStats,
  });

  if (isLoading) {
    return (
      <Container maxW='full'>
        <Heading size='lg' pt={12}>
          Загрузка...
        </Heading>
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container maxW='full'>
        <Heading size='lg' pt={12}>
          Нет данных для отображения
        </Heading>
      </Container>
    );
  }

  //Translation mapping for status names
  const StatusTranslation: Record<string, string> = {
    shipment: 'Отгрузка',
    incoming: 'Поступления',
    warehouse: 'Склад',
    shipped: 'Отгружено',
  };

  // Prepare data for status distribution pie chart
  const statusData = stats.status_distribution
    ? Object.entries(stats.status_distribution).map(
        ([status, count]) => ({
          name: StatusTranslation[status] || status,
          value: count as number,
        })
      )
    : [];

  // Colors for pie chart
  const COLORS = [
    '#0088FE',
    '#00C49F',
    '#FFBB28',
    '#FF8042',
    '#8884D8',
  ];

  // Prepare data for top owners bar chart
  const topOwnersData = stats.top_owners
    ? stats.top_owners.map((owner) => ({
        name: owner.owner_email?.split('@')[0] || 'Unknown', // Show only username part
        items: owner.item_count || 0,
      }))
    : [];

  return (
    <Container maxW='full'>
      <Heading size='lg' pt={12} pb={6}>
        Панель управления
      </Heading>

      <SimpleGrid
        columns={{ base: 1, md: 2, lg: 4 }}
        gap={6}
      >
        <Card.Root>
          <Card.Body>
            <Stat alignContent='start' gap={2}>
              <Text fontSize='lg' fontWeight='bold'>
                Всего товаров
              </Text>
              <Text
                fontSize='2xl'
                fontWeight='bold'
                color='blue.500'
              >
                {stats.total_items}
              </Text>
              <Text fontSize='sm' color='gray.600'>
                Общее количество
              </Text>
            </Stat>
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <Stat>
              <StatLabel>Пользователей</StatLabel>
              <Text>{stats.total_users}</Text>
              <StatHelpText>
                Активных пользователей
              </StatHelpText>
            </Stat>
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <Stat>
              <StatLabel>В процессе</StatLabel>
              <Text>
                {(
                  (stats.status_distribution || {})
                    .warehouse ?? 0
                ).toString()}
              </Text>
              <StatHelpText>Ожидают обработки</StatHelpText>
            </Stat>
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <Stat>
              <StatLabel>На складе</StatLabel>
              <Text>
                {(
                  (stats.status_distribution || {})
                    .warehouse ?? 0
                ).toString()}
              </Text>
              <StatHelpText>Готовы к отгрузке</StatHelpText>
            </Stat>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      {/* Краткие ссылки */}
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4} mt={6}>
        <RouterLink to="/items">
          <Card.Root
            cursor="pointer"
            _hover={{ bg: 'gray.50' }}
            transition="background 0.2s"
          >
            <Card.Body display="flex" flexDirection="row" alignItems="center" gap={3}>
              <Box color="blue.500">
                <FiArrowDownRight size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold">Поступления</Text>
                <Text fontSize="sm" color="gray.600">
                  Новые товары
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
        <RouterLink to="/warehouse">
          <Card.Root
            cursor="pointer"
            _hover={{ bg: 'gray.50' }}
            transition="background 0.2s"
          >
            <Card.Body display="flex" flexDirection="row" alignItems="center" gap={3}>
              <Box color="green.500">
                <FiBox size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold">Склад</Text>
                <Text fontSize="sm" color="gray.600">
                  На складе
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
        <RouterLink to="/shipment">
          <Card.Root
            cursor="pointer"
            _hover={{ bg: 'gray.50' }}
            transition="background 0.2s"
          >
            <Card.Body display="flex" flexDirection="row" alignItems="center" gap={3}>
              <Box color="orange.500">
                <FiTruck size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold">Отгрузка</Text>
                <Text fontSize="sm" color="gray.600">
                  В отгрузке
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
        <RouterLink to="/shipped">
          <Card.Root
            cursor="pointer"
            _hover={{ bg: 'gray.50' }}
            transition="background 0.2s"
          >
            <Card.Body display="flex" flexDirection="row" alignItems="center" gap={3}>
              <Box color="green.500">
                <FiCheckCircle size={24} />
              </Box>
              <VStack align="start" gap={0}>
                <Text fontWeight="semibold">Отгружено</Text>
                <Text fontSize="sm" color="gray.600">
                  Архив
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </RouterLink>
      </SimpleGrid>

      {/* Последние поступления и В отгрузке */}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={6} mt={6}>
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={3}>
              Последние поступления
            </Heading>
            {stats.latest_incoming && stats.latest_incoming.length > 0 ? (
              <VStack align="stretch" gap={2}>
                {stats.latest_incoming.map((item) => (
                  <Box
                    key={item.id}
                    py={2}
                    borderBottomWidth="1px"
                    borderColor="gray.100"
                    _last={{ borderBottomWidth: 0 }}
                  >
                    <Text fontWeight="medium" lineClamp={1}>
                      {item.title}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString('ru-RU')
                        : ''}
                    </Text>
                  </Box>
                ))}
                <Box mt={2}>
                  <RouterLink to="/items">
                    <Link fontSize="sm" color="blue.500">
                      Все поступления →
                    </Link>
                  </RouterLink>
                </Box>
              </VStack>
            ) : (
              <Text color="gray.500" fontSize="sm">
                Нет поступлений
              </Text>
            )}
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={3}>
              В отгрузке
            </Heading>
            <Text fontSize="2xl" fontWeight="bold" color="orange.500">
              {(stats.status_distribution || {}).shipment ?? 0}
            </Text>
            <Text fontSize="sm" color="gray.600" mb={3}>
              товаров в отгрузке
            </Text>
            <RouterLink to="/shipment">
              <Link fontSize="sm" color="blue.500">
                К отгрузке →
              </Link>
            </RouterLink>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      {/* Visual Graphics Section */}
      <SimpleGrid
        columns={{ base: 1, lg: 2 }}
        gap={6}
        mt={8}
      >
        {/* Status Distribution Pie Chart */}
        <Card.Root>
          <Card.Body>
            <Heading size='md' mb={4}>
              Распределение по статусам
            </Heading>
            {statusData.length > 0 ? (
              <Box height='300px'>
                <ResponsiveContainer
                  width='100%'
                  height='100%'
                >
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx='50%'
                      cy='50%'
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${((percent as number) * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill='#8884d8'
                      dataKey='value'
                    >
                      {statusData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            COLORS[index % COLORS.length]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text>Нет данных о статусах</Text>
            )}
          </Card.Body>
        </Card.Root>

        {/* Top Owners Bar Chart */}
        <Card.Root>
          <Card.Body>
            <Heading size='md' mb={4}>
              Топ владельцев по количеству товаров
            </Heading>
            {topOwnersData.length > 0 ? (
              <Box height='300px'>
                <ResponsiveContainer
                  width='100%'
                  height='100%'
                >
                  <BarChart data={topOwnersData}>
                    <CartesianGrid strokeDasharray='3 3' />
                    <XAxis
                      dataKey='name'
                      angle={-45}
                      textAnchor='end'
                      height={80}
                      fontSize={12}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey='items' fill='#8884d8' />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text>Нет данных о владельцах</Text>
            )}
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <Box mt={8}>
        <Heading size='md' mb={4}>
          Активные пользователи
        </Heading>
        <Card.Root>
          <Card.Body>
            {stats.top_owners &&
            stats.top_owners.length > 0 ? (
              <SimpleGrid
                columns={{ base: 1, md: 2, lg: 3 }}
                gap={4}
              >
                {stats.top_owners.map((owner, index) => (
                  <Box
                    key={owner.owner_email}
                    p={3}
                    borderWidth={1}
                    borderRadius='md'
                  >
                    <Text fontWeight='bold'>
                      #{index + 1}
                    </Text>
                    <Text fontSize='sm' color='gray.600'>
                      {owner.owner_email}
                    </Text>
                    <Text
                      fontSize='lg'
                      fontWeight='semibold'
                    >
                      {owner.item_count} товаров
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            ) : (
              <Text>Нет данных о владельцах</Text>
            )}
          </Card.Body>
        </Card.Root>
      </Box>
    </Container>
  );
}

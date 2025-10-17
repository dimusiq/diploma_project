import {
  Container,
  Heading,
  SimpleGrid,
  Card,
  Text,
  Box,
} from '@chakra-ui/react';
import {
  Stat,
  StatLabel,
  StatHelpText,
} from '@chakra-ui/stat';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
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

import { DashboardService } from '@/client';

export const Route = createFileRoute('/_layout/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => DashboardService.getDashboardStats(),
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

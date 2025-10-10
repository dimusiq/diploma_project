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

import { Container, Heading } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ItemsService } from '@/client';
import PendingItems from '@/components/Pending/PendingItems';
import { ItemActionsMenu } from '@/components/Common/ItemActionsMenu';
import { ShortId } from '@/components/Common/ShortId';
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@/components/ui/pagination';
import {
  Table,
  Flex,
  VStack,
  EmptyState,
} from '@chakra-ui/react';
import { FiSearch } from 'react-icons/fi';

const PER_PAGE = 5;

function getItemsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        status: 'shipment',
      }),
    queryKey: ['items', { page }],
  };
}

export const Route = createFileRoute('/_layout/shipment')({
  component: Shipment,
});

function ShipmentTable() {
  const page = 1;
  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions({ page }),
    placeholderData: (prev) => prev,
  });

  const items = data?.data.slice(0, PER_PAGE) ?? [];
  const count = data?.count ?? 0;

  if (isLoading) return <PendingItems />;

  if (items.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiSearch />
          </EmptyState.Indicator>
          <VStack textAlign='center'>
            <EmptyState.Title>
              Нет товаров на складе
            </EmptyState.Title>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <>
      <Table.Root size={{ base: 'sm', md: 'md' }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w='sm'>ID</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Название</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Описание</Table.ColumnHeader>
            <Table.ColumnHeader w='xs'>Кол-во</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Артикул</Table.ColumnHeader>
            <Table.ColumnHeader w='xs'>Ед.</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Действия</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => (
            <Table.Row key={item.id} opacity={isPlaceholderData ? 0.5 : 1}>
              <Table.Cell><ShortId id={item.id} /></Table.Cell>
              <Table.Cell>{item.title}</Table.Cell>
              <Table.Cell>{item.description || 'N/A'}</Table.Cell>
              <Table.Cell>{item.quantity ?? 1}</Table.Cell>
              <Table.Cell>{item.sku || '—'}</Table.Cell>
              <Table.Cell>{item.unit || '—'}</Table.Cell>
              <Table.Cell>
                <ItemActionsMenu item={item} />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex justifyContent='flex-end' mt={4}>
        <PaginationRoot count={count} pageSize={PER_PAGE}>
          <Flex>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
    </>
  );
}

function Shipment() {
  return (
    <Container maxW='full'>
      <Heading size='lg' pt={12}>
        Отгрузка
      </Heading>
      <ShipmentTable />
    </Container>
  );
}

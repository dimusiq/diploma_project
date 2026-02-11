import {
  Container,
  EmptyState,
  Flex,
  Heading,
  Input,
  Table,
  VStack,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router';
import { FiSearch } from 'react-icons/fi';
import { z } from 'zod';

import { CategoriesService, ItemsService } from '@/client';
import { ItemActionsMenu } from '@/components/Common/ItemActionsMenu';
import { ShortId } from '@/components/Common/ShortId';
import AddItem from '@/components/Items/AddItem';
import PendingItems from '@/components/Pending/PendingItems';
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@/components/ui/pagination.tsx';

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
  search: z.string().catch(''),
  category_id: z.string().catch(''),
});

const PER_PAGE = 5;

function getItemsQueryOptions({
  page,
  search,
  category_id,
}: {
  page: number;
  search: string;
  category_id: string;
}) {
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        search: search || undefined,
        category_id: category_id || undefined,
      }),
    queryKey: ['items', { page, search, category_id }],
  };
}

export const Route = createFileRoute('/_layout/items')({
  component: Items,
  validateSearch: (search) =>
    itemsSearchSchema.parse(search),
});

function ItemsTable() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { page, search, category_id } = Route.useSearch();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesService.readCategories(),
  });

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions({ page, search, category_id }),
    placeholderData: (prevData) => prevData,
  });

  const setSearchParams = (updates: { page?: number; search?: string; category_id?: string }) =>
    navigate({
      search: (prev: z.infer<typeof itemsSearchSchema>) => ({ ...prev, ...updates }),
    });

  const items = data?.data.slice(0, PER_PAGE) ?? [];
  const count = data?.count ?? 0;

  if (isLoading) {
    return <PendingItems />;
  }

  if (items.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiSearch />
          </EmptyState.Indicator>
          <VStack textAlign='center'>
            <EmptyState.Title>
              Нет добавленных слотов
            </EmptyState.Title>
            <EmptyState.Description>
              Добавьте слоты, чтобы они отображались здесь.
            </EmptyState.Description>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <>
      <Flex gap={3} mb={4} flexWrap="wrap" align="center">
        <Input
          placeholder="Поиск по названию, описанию, артикулу..."
          value={search}
          onChange={(e) => setSearchParams({ search: e.target.value, page: 1 })}
          maxW="xs"
          size="sm"
        />
        <select
          value={category_id}
          onChange={(e) => setSearchParams({ category_id: e.target.value, page: 1 })}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--chakra-colors-border)',
            minWidth: '160px',
            fontSize: '14px',
          }}
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Flex>
      <Table.Root size={{ base: 'sm', md: 'md' }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w='sm'>ID</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Название</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Описание</Table.ColumnHeader>
            <Table.ColumnHeader w='xs'>Кол-во</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Артикул</Table.ColumnHeader>
            <Table.ColumnHeader w='xs'>Ед.</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Категория</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Действия</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items?.map((item) => (
            <Table.Row key={item.id} opacity={isPlaceholderData ? 0.5 : 1}>
              <Table.Cell truncate maxW='sm'><ShortId id={item.id} /></Table.Cell>
              <Table.Cell truncate maxW='sm'>{item.title}</Table.Cell>
              <Table.Cell color={!item.description ? 'gray' : 'inherit'} truncate maxW='30%'>
                {item.description || 'N/A'}
              </Table.Cell>
              <Table.Cell>{item.quantity ?? 1}</Table.Cell>
              <Table.Cell truncate maxW='sm'>{item.sku || '—'}</Table.Cell>
              <Table.Cell>{item.unit || '—'}</Table.Cell>
              <Table.Cell truncate maxW='sm'>
                {item.category_id ? categories.find((c) => c.id === item.category_id)?.name ?? '—' : '—'}
              </Table.Cell>
              <Table.Cell>
                <ItemActionsMenu item={item} />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex justifyContent='flex-end' mt={4}>
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page }) => setSearchParams({ page })}
        >
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

function Items() {
  return (
    <Container maxW='full'>
      <Heading size='lg' pt={12}>
        Поступления
      </Heading>
      <AddItem />
      <ItemsTable />
    </Container>
  );
}

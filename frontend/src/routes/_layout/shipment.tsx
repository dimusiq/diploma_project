import {
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Table,
  VStack,
  EmptyState,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FiPrinter, FiSearch } from 'react-icons/fi';
import { useCallback, useState } from 'react';
import { z } from 'zod';

import { openShippingNotePdf } from '@/api/printPdf';
import { CategoriesService, ItemsService } from '@/client';
import useCustomToast from '@/hooks/useCustomToast';
import PendingItems from '@/components/Pending/PendingItems';
import { ItemActionsMenu } from '@/components/Common/ItemActionsMenu';
import { ItemSelectionToolbar } from '@/components/Common/ItemSelectionToolbar';
import { ShortId } from '@/components/Common/ShortId';
import { MoveItemsDialog } from '@/components/Items/MoveItemsDialog';
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';
const shipmentSearchSchema = z.object({
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
        status: 'shipment',
        search: search || undefined,
        category_id: category_id || undefined,
      }),
    queryKey: ['items', 'shipment', { page, search, category_id }],
  };
}

export const Route = createFileRoute('/_layout/shipment')({
  component: Shipment,
  validateSearch: (s) => shipmentSearchSchema.parse(s),
});

function ShipmentTable() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { showErrorToast } = useCustomToast();
  const { page, search, category_id } = Route.useSearch();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesService.readCategories(),
  });

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions({ page, search, category_id }),
    placeholderData: (prev) => prev,
  });

  const setSearchParams = (updates: { page?: number; search?: string; category_id?: string }) =>
    navigate({
      search: (prev: z.infer<typeof shipmentSearchSchema>) => ({ ...prev, ...updates }),
    });

  const items = data?.data.slice(0, PER_PAGE) ?? [];
  const count = data?.count ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const ids = items.map((i) => i.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, [items, selectedIds]);

  const isAllSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const isSomeSelected = items.some((i) => selectedIds.has(i.id));

  const handlePrintSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsPrinting(true);
    try {
      await openShippingNotePdf(ids);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Ошибка печати накладной');
    } finally {
      setIsPrinting(false);
    }
  }, [selectedIds, showErrorToast]);

  const handlePrintAllPage = useCallback(async () => {
    try {
      await openShippingNotePdf(items.map((i) => i.id));
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Ошибка печати накладной');
    }
  }, [items, showErrorToast]);

  const handleMoveSuccess = useCallback(() => setSelectedIds(new Set()), []);

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
      <ItemSelectionToolbar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onPrintShippingNote={handlePrintSelected}
        onMove={() => setMoveDialogOpen(true)}
        isPrinting={isPrinting}
      />
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
        <Button
          size="sm"
          variant="outline"
          onClick={handlePrintAllPage}
          disabled={items.length === 0}
        >
          <Flex as="span" gap={2} align="center">
            <FiPrinter />
            Печать накладной (вся страница)
          </Flex>
        </Button>
      </Flex>
      <Table.Root size={{ base: 'sm', md: 'md' }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w='xs'>
              <Checkbox
                checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                onCheckedChange={toggleAll}
                aria-label="Выбрать все"
              />
            </Table.ColumnHeader>
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
          {items.map((item) => (
            <Table.Row key={item.id} opacity={isPlaceholderData ? 0.5 : 1}>
              <Table.Cell>
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleOne(item.id)}
                  aria-label={`Выбрать ${item.title}`}
                />
              </Table.Cell>
              <Table.Cell><ShortId id={item.id} /></Table.Cell>
              <Table.Cell>{item.title}</Table.Cell>
              <Table.Cell>{item.description || 'N/A'}</Table.Cell>
              <Table.Cell>{item.quantity ?? 1}</Table.Cell>
              <Table.Cell>{item.sku || '—'}</Table.Cell>
              <Table.Cell>{item.unit || '—'}</Table.Cell>
              <Table.Cell>
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
      <MoveItemsDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        selectedIds={Array.from(selectedIds)}
        selectedItems={items.filter((i) => selectedIds.has(i.id)).map((i) => ({ id: i.id, status: i.status }))}
        onSuccess={handleMoveSuccess}
      />
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

import {
  Box,
  Button,
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
import { FiChevronDown, FiChevronUp, FiDownload, FiSearch } from 'react-icons/fi';
import { useCallback, useState } from 'react';
import { z } from 'zod';

import { downloadItemsExport } from '@/api/exportItems';
import { openShippingNotePdf } from '@/api/printPdf';
import { CategoriesService, ItemsService } from '@/client';
import { ItemActionsMenu } from '@/components/Common/ItemActionsMenu';
import { ItemSelectionToolbar } from '@/components/Common/ItemSelectionToolbar';
import { ShortId } from '@/components/Common/ShortId';
import AddItem from '@/components/Items/AddItem';
import { MassEditItemsDialog } from '@/components/Items/MassEditItemsDialog';
import { MoveItemsDialog } from '@/components/Items/MoveItemsDialog';
import PendingItems from '@/components/Pending/PendingItems';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu';
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@/components/ui/pagination.tsx';
import { Checkbox } from '@/components/ui/checkbox';
import useCustomToast from '@/hooks/useCustomToast';

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
  search: z.string().catch(''),
  category_id: z.string().catch(''),
  created_at_from: z.string().catch(''),
  created_at_to: z.string().catch(''),
  sort_by: z.enum(['title', 'created_at', 'quantity', 'sku']).catch('created_at'),
  sort_order: z.enum(['asc', 'desc']).catch('desc'),
});

const PER_PAGE = 5;

type ItemsSearch = z.infer<typeof itemsSearchSchema>;

function getItemsQueryOptions(
  params: ItemsSearch & { status?: string }
) {
  const { page, search, category_id, created_at_from, created_at_to, sort_by, sort_order, status } = params;
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        search: search || undefined,
        category_id: category_id || undefined,
        created_at_from: created_at_from || undefined,
        created_at_to: created_at_to || undefined,
        sort_by: sort_by || undefined,
        sort_order: sort_order || undefined,
        status: status || undefined,
      }),
    queryKey: ['items', params],
  };
}

export const Route = createFileRoute('/_layout/items')({
  component: Items,
  validateSearch: (search) =>
    itemsSearchSchema.parse(search),
});

function ItemsTable() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { showErrorToast } = useCustomToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [massEditDialogOpen, setMassEditDialogOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchParams = Route.useSearch() as ItemsSearch;

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesService.readCategories(),
  });

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions(searchParams),
    placeholderData: (prevData) => prevData,
  });

  const setSearchParams = (updates: Partial<ItemsSearch>) =>
    navigate({
      search: (prev: ItemsSearch) => ({ ...prev, ...updates }),
    });

  const handleSort = (field: 'title' | 'created_at' | 'quantity' | 'sku') => {
    setSearchParams({
      sort_by: field,
      sort_order: searchParams.sort_by === field && searchParams.sort_order === 'desc' ? 'asc' : 'desc',
      page: 1,
    });
  };

  const SortHeader = ({ field, label }: { field: 'title' | 'created_at' | 'quantity' | 'sku'; label: string }) => (
    <Table.ColumnHeader
      w="sm"
      cursor="pointer"
      onClick={() => handleSort(field)}
      _hover={{ bg: 'gray.100' }}
      whiteSpace="nowrap"
    >
      {label}
      {searchParams.sort_by === field
        ? searchParams.sort_order === 'desc'
          ? <Box as={FiChevronDown} display="inline" ml={1} />
          : <Box as={FiChevronUp} display="inline" ml={1} />
        : null}
    </Table.ColumnHeader>
  );

  const items = data?.data.slice(0, PER_PAGE) ?? [];
  const count = data?.count ?? 0;

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

  const handlePrintShippingNote = useCallback(async () => {
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

  const handleMoveSuccess = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleExport = useCallback(
    async (format: 'csv' | 'xlsx') => {
      setIsExporting(true);
      try {
        await downloadItemsExport({
          format,
          status: undefined,
          search: searchParams.search || undefined,
          category_id: searchParams.category_id || undefined,
          created_at_from: searchParams.created_at_from || undefined,
          created_at_to: searchParams.created_at_to || undefined,
        });
      } catch (e) {
        showErrorToast(e instanceof Error ? e.message : 'Ошибка выгрузки');
      } finally {
        setIsExporting(false);
      }
    },
    [searchParams, showErrorToast]
  );

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
      <ItemSelectionToolbar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onPrintShippingNote={handlePrintShippingNote}
        onMove={() => setMoveDialogOpen(true)}
        onMassEdit={() => setMassEditDialogOpen(true)}
        isPrinting={isPrinting}
      />
      <Flex gap={3} mb={4} flexWrap="wrap" align="center">
        <Input
          placeholder="Поиск по названию, описанию, артикулу..."
          value={searchParams.search}
          onChange={(e) => setSearchParams({ search: e.target.value, page: 1 })}
          maxW="xs"
          size="sm"
        />
        <select
          value={searchParams.category_id}
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
        <Input
          type="date"
          size="sm"
          maxW="40"
          value={searchParams.created_at_from}
          onChange={(e) => setSearchParams({ created_at_from: e.target.value, page: 1 })}
          placeholder="Дата от"
        />
        <Input
          type="date"
          size="sm"
          maxW="40"
          value={searchParams.created_at_to}
          onChange={(e) => setSearchParams({ created_at_to: e.target.value, page: 1 })}
          placeholder="Дата до"
        />
        <MenuRoot>
          <MenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={isExporting}>
              <Flex as="span" gap={2} align="center">
                <Box as={FiDownload} />
                Выгрузить
              </Flex>
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem value="csv" onClick={() => handleExport('csv')}>
              CSV
            </MenuItem>
            <MenuItem value="xlsx" onClick={() => handleExport('xlsx')}>
              Excel
            </MenuItem>
          </MenuContent>
        </MenuRoot>
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
            <SortHeader field="title" label="Название" />
            <Table.ColumnHeader w='sm'>Описание</Table.ColumnHeader>
            <SortHeader field="quantity" label="Кол-во" />
            <SortHeader field="sku" label="Артикул" />
            <Table.ColumnHeader w='xs'>Ед.</Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>Категория</Table.ColumnHeader>
            <SortHeader field="created_at" label="Дата" />
            <Table.ColumnHeader w='sm'>Действия</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items?.map((item) => (
            <Table.Row key={item.id} opacity={isPlaceholderData ? 0.5 : 1}>
              <Table.Cell>
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleOne(item.id)}
                  aria-label={`Выбрать ${item.title}`}
                />
              </Table.Cell>
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
              <Table.Cell whiteSpace="nowrap">
                {item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '—'}
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
      <MassEditItemsDialog
        open={massEditDialogOpen}
        onOpenChange={setMassEditDialogOpen}
        selectedIds={Array.from(selectedIds)}
        onSuccess={handleMoveSuccess}
      />
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

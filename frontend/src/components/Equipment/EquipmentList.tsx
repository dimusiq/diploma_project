import {
  Box,
  Button,
  EmptyState,
  Flex,
  Input,
  Table,
  Text,
} from '@chakra-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FaPlus } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';

import { equipmentApi, EQUIPMENT_TYPE_LABELS, type EquipmentPublic } from '@/api/equipment';
import { zonesApi } from '@/api/zones';
import useCustomToast from '@/hooks/useCustomToast';
import { handleError } from '@/utils';
import { EquipmentFormDialog } from './EquipmentFormDialog';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu';

const STATUS_LABELS: Record<string, string> = {
  active: 'В эксплуатации',
  maintenance: 'На обслуживании',
  decommissioned: 'Выведена из эксплуатации',
};

const PER_PAGE = 10;

export function EquipmentList() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showErrorToast } = useCustomToast();

  const { data: zones = [] } = useQuery({
    queryKey: ['zones'],
    queryFn: () => zonesApi.list(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', page, search, statusFilter, typeFilter],
    queryFn: () =>
      equipmentApi.list({
        skip: page * PER_PAGE,
        limit: PER_PAGE,
        search: search || undefined,
        current_status: statusFilter || undefined,
        equipment_type: typeFilter || undefined,
      }),
  });

  const items = data?.data ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PER_PAGE));

  const handleEdit = (item: EquipmentPublic) => {
    navigate({ to: '/technique/equipment/$equipmentId', params: { equipmentId: item.id } });
  };

  const handleDelete = async (item: EquipmentPublic) => {
    if (!confirm(`Удалить технику «${item.brand_name} ${item.model}»?`)) return;
    try {
      await equipmentApi.delete(item.id);
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    } catch (err) {
      if (err instanceof Error) {
        showErrorToast(err.message);
      } else {
        handleError(err as Parameters<typeof handleError>[0]);
      }
    }
  };

  const handleAdd = () => {
    setFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
  };

  return (
    <Box>
      <Flex direction={{ base: 'column', md: 'row' }} gap={4} mb={4} wrap="wrap">
        <Flex gap={2} align="center" flex="1" minW="200px">
          <Input
            placeholder="Поиск (серийный номер, бренд, модель)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="sm"
          />
          <Box color="fg.muted">
            <FiSearch />
          </Box>
        </Flex>
        <Flex gap={2} align="center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--chakra-colors-border)',
              fontSize: '14px',
            }}
          >
            <option value="">Все типы</option>
            {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--chakra-colors-border)',
              fontSize: '14px',
            }}
          >
            <option value="">Все состояния</option>
            <option value="active">В эксплуатации</option>
            <option value="maintenance">На обслуживании</option>
            <option value="decommissioned">Выведена из эксплуатации</option>
          </select>
          <Button size="sm" onClick={handleAdd}>
            <FaPlus />
            Добавить
          </Button>
        </Flex>
      </Flex>

      {isLoading ? (
        <Text color="fg.muted">Загрузка...</Text>
      ) : items.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <FaPlus />
            </EmptyState.Indicator>
            <EmptyState.Title>Нет техники</EmptyState.Title>
            <EmptyState.Description>
              Складская техника: бренды задаются в разделе «Администрирование» → Бренды.
            </EmptyState.Description>
            <Button onClick={handleAdd}>Добавить технику</Button>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Тип</Table.ColumnHeader>
              <Table.ColumnHeader>Серийный №</Table.ColumnHeader>
              <Table.ColumnHeader>Бренд / Модель</Table.ColumnHeader>
              <Table.ColumnHeader>Ввод в эксплуатацию</Table.ColumnHeader>
              <Table.ColumnHeader>Моточасы</Table.ColumnHeader>
              <Table.ColumnHeader>Состояние</Table.ColumnHeader>
              <Table.ColumnHeader>Зона склада</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Действия</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row
                key={item.id}
                cursor="pointer"
                transition="background 0.15s ease"
                _hover={{ bg: 'gray.subtle' }}
                _active={{ bg: 'gray.muted' }}
                onClick={() => handleEdit(item)}
              >
                <Table.Cell>
                  <Text fontSize="sm">{EQUIPMENT_TYPE_LABELS[item.equipment_type] ?? item.equipment_type}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{item.serial_number || '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontWeight="medium">{item.brand_name} {item.model}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{item.commissioned_at ?? '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{item.engine_hours != null ? item.engine_hours : '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{STATUS_LABELS[item.current_status] ?? item.current_status}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">
                    {zones.some((z) => z.name === item.zone) ? item.zone : '—'}
                  </Text>
                </Table.Cell>
                <Table.Cell textAlign="end" onClick={(e) => e.stopPropagation()}>
                  <MenuRoot>
                    <MenuTrigger asChild>
                      <Button size="xs" variant="ghost" aria-label="Действия">
                        ⋮
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem value="delete" onClick={() => handleDelete(item)} color="red">
                        Удалить
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}

      {totalPages > 1 && (
        <Flex justify="space-between" align="center" mt={4}>
          <Text fontSize="sm" color="fg.muted">
            Показано {items.length} из {count}
          </Text>
          <Flex gap={2}>
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Назад
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд
            </Button>
          </Flex>
        </Flex>
      )}

      <EquipmentFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        editItem={null}
        asDrawer={false}
      />
    </Box>
  );
}

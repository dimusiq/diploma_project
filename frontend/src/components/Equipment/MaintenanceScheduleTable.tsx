/**
 * График ТО — таблица с производными данными по моточасам.
 * Типичный UI: таблица, статусы с цветовой индикацией, фильтры, сводка.
 */
import {
  Badge,
  Box,
  Flex,
  Table,
  Text,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { equipmentApi, EQUIPMENT_TYPE_LABELS, type EquipmentPublic } from '@/api/equipment';

/** Интервал ТО по моточасам (м/ч) */
const MAINTENANCE_INTERVAL_HOURS = 500;
/** «Скоро» — если до следующего ТО осталось не более этого процента от интервала */
const DUE_SOON_THRESHOLD_PERCENT = 20;

type ScheduleStatus = 'overdue' | 'due_soon' | 'ok';

function getNextServiceAtHours(engineHours: number | null): number | null {
  if (engineHours == null) return null;
  return Math.ceil(engineHours / MAINTENANCE_INTERVAL_HOURS) * MAINTENANCE_INTERVAL_HOURS;
}

/** Предыдущее ТО — последняя отметка по интервалу (м/ч), на которой проводилось ТО */
function getLastMaintenanceAtHours(engineHours: number | null): number | null {
  if (engineHours == null) return null;
  const last = Math.floor(engineHours / MAINTENANCE_INTERVAL_HOURS) * MAINTENANCE_INTERVAL_HOURS;
  return last > 0 ? last : null;
}

function getScheduleStatus(
  engineHours: number | null,
  nextAt: number | null
): ScheduleStatus {
  if (engineHours == null || nextAt == null) return 'ok';
  if (engineHours >= nextAt) return 'overdue';
  const interval = MAINTENANCE_INTERVAL_HOURS;
  const remaining = nextAt - engineHours;
  if (remaining <= (interval * DUE_SOON_THRESHOLD_PERCENT) / 100) return 'due_soon';
  return 'ok';
}

interface RowData {
  equipment: EquipmentPublic;
  engineHours: number | null;
  lastMaintenanceAtHours: number | null;
  nextServiceAtHours: number | null;
  status: ScheduleStatus;
}

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  overdue: 'Просрочено',
  due_soon: 'Скоро',
  ok: 'Норма',
};

const STATUS_COLOR: Record<ScheduleStatus, string> = {
  overdue: 'red',
  due_soon: 'yellow',
  ok: 'green',
};

export function MaintenanceScheduleTable() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ScheduleStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', 'schedule'],
    queryFn: () =>
      equipmentApi.list({ limit: 500, skip: 0 }),
  });

  const rows: RowData[] = useMemo(() => {
    const list = data?.data ?? [];
    return list.map((equipment) => {
      const engineHours = equipment.engine_hours ?? null;
      const lastAt = getLastMaintenanceAtHours(engineHours);
      const nextAt = getNextServiceAtHours(engineHours);
      const status = getScheduleStatus(engineHours, nextAt);
      return { equipment, engineHours, lastMaintenanceAtHours: lastAt, nextServiceAtHours: nextAt, status };
    });
  }, [data?.data]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (typeFilter) {
      list = list.filter((r) => r.equipment.equipment_type === typeFilter);
    }
    return [...list].sort((a, b) => {
      const order: Record<ScheduleStatus, number> = { overdue: 0, due_soon: 1, ok: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      const nextA = a.nextServiceAtHours ?? 1e9;
      const nextB = b.nextServiceAtHours ?? 1e9;
      return nextA - nextB;
    });
  }, [rows, statusFilter, typeFilter]);

  const summary = useMemo(() => {
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const dueSoon = rows.filter((r) => r.status === 'due_soon').length;
    return { overdue, dueSoon };
  }, [rows]);

  if (isLoading) {
    return <Text color="fg.muted">Загрузка...</Text>;
  }

  return (
    <Box>
      <Flex gap={4} mb={4} flexWrap="wrap" align="center">
        <Flex gap={2} flexWrap="wrap">
          <Badge colorPalette="red" px={2} py={1}>
            Просрочено: {summary.overdue}
          </Badge>
          <Badge colorPalette="yellow" px={2} py={1}>
            Скоро: {summary.dueSoon}
          </Badge>
        </Flex>
        <Flex gap={2} align="center">
          <Text fontSize="sm" color="fg.muted">
            Статус:
          </Text>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value || '') as ScheduleStatus | '')}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--chakra-colors-border)',
              fontSize: '14px',
            }}
          >
            <option value="">Все</option>
            <option value="overdue">Просрочено</option>
            <option value="due_soon">Скоро</option>
            <option value="ok">Норма</option>
          </select>
          <Text fontSize="sm" color="fg.muted" ml={2}>
            Тип:
          </Text>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '6px 10px',
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
        </Flex>
      </Flex>

      <Text fontSize="sm" color="fg.muted" mb={2}>
        Следующее ТО рассчитывается по моточасам (интервал {MAINTENANCE_INTERVAL_HOURS} м/ч). Клик по строке — переход в карточку техники.
      </Text>

      {filteredRows.length === 0 ? (
        <Text color="fg.muted">Нет техники по выбранным фильтрам.</Text>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Техника</Table.ColumnHeader>
              <Table.ColumnHeader>Тип</Table.ColumnHeader>
              <Table.ColumnHeader>Предыдущее ТО (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Моточасы</Table.ColumnHeader>
              <Table.ColumnHeader>След. ТО (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Статус</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredRows.map(({ equipment, engineHours, lastMaintenanceAtHours, nextServiceAtHours, status }) => (
              <Table.Row
                key={equipment.id}
                cursor="pointer"
                _hover={{ bg: 'gray.subtle' }}
                _active={{ bg: 'gray.muted' }}
                onClick={() =>
                  navigate({ to: '/technique/equipment/$equipmentId', params: { equipmentId: equipment.id } })
                }
              >
                <Table.Cell>
                  <Text fontWeight="medium">
                    {equipment.brand_name} {equipment.model}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {equipment.serial_number || '—'}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">
                    {EQUIPMENT_TYPE_LABELS[equipment.equipment_type] ?? equipment.equipment_type}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{lastMaintenanceAtHours != null ? lastMaintenanceAtHours : '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{engineHours != null ? engineHours : '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm">{nextServiceAtHours != null ? nextServiceAtHours : '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="sm" colorPalette={STATUS_COLOR[status]}>
                    {STATUS_LABELS[status]}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  );
}

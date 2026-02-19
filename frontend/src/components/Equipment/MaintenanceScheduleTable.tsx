/**
 * График ТО — таблица с производными данными по моточасам.
 * Типичный UI: таблица, статусы с цветовой индикацией, фильтры, сводка.
 */
import {
  Badge,
  Box,
  Button,
  Flex,
  Table,
  Text,
} from '@chakra-ui/react';
import { FiDownload } from 'react-icons/fi';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';

import { equipmentApi, EQUIPMENT_TYPE_LABELS, type EquipmentPublic } from '@/api/equipment';
import {
  downloadMaintenanceScheduleCsv,
  downloadMaintenanceScheduleXlsx,
} from '@/api/exportMaintenanceSchedule';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu';
import { getMaintenanceChains, getRemindBeforeHoursForEquipment } from '@/utils/maintenanceChains';
import { getDefaultIntervalHours, getRemindBeforeHours } from '@/utils/maintenanceIntervals';

type ScheduleStatus = 'overdue' | 'due_soon' | 'ok';

function getNextServiceAtHours(engineHours: number | null, intervalHours: number): number | null {
  if (engineHours == null) return null;
  return Math.ceil(engineHours / intervalHours) * intervalHours;
}

/** Предыдущее ТО — последняя отметка по интервалу (м/ч), на которой проводилось ТО */
function getLastMaintenanceAtHours(engineHours: number | null, intervalHours: number): number | null {
  if (engineHours == null) return null;
  const last = Math.floor(engineHours / intervalHours) * intervalHours;
  return last > 0 ? last : null;
}

/** Статус по моточасам: «Скоро» — если до ТО осталось не более remindBeforeHours (настраивается в Расписании ТО). */
function getScheduleStatus(
  engineHours: number | null,
  nextAt: number | null,
  remindBeforeHours: number
): ScheduleStatus {
  if (engineHours == null || nextAt == null) return 'ok';
  if (engineHours >= nextAt) return 'overdue';
  const remaining = nextAt - engineHours;
  if (remaining <= remindBeforeHours) return 'due_soon';
  return 'ok';
}

interface RowData {
  equipment: EquipmentPublic;
  engineHours: number | null;
  lastMaintenanceAtHours: number | null;
  nextServiceAtHours: number | null;
  status: ScheduleStatus;
  /** Имя первой (для сортировки) последовательности ТО, в которой есть эта техника */
  primaryChainName: string;
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

const FILTERS_STORAGE_KEY = 'maintenance_schedule_filters';

function loadFilters(): { statusFilter: ScheduleStatus | ''; typeFilter: string; chainFilter: string; sortByChain: boolean } {
  if (typeof window === 'undefined') return { statusFilter: '', typeFilter: '', chainFilter: '', sortByChain: false };
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return { statusFilter: '', typeFilter: '', chainFilter: '', sortByChain: false };
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      statusFilter: (o.statusFilter === 'overdue' || o.statusFilter === 'due_soon' || o.statusFilter === 'ok' ? o.statusFilter : '') as ScheduleStatus | '',
      typeFilter: typeof o.typeFilter === 'string' ? o.typeFilter : '',
      chainFilter: typeof o.chainFilter === 'string' ? o.chainFilter : '',
      sortByChain: o.sortByChain === true,
    };
  } catch {
    return { statusFilter: '', typeFilter: '', chainFilter: '', sortByChain: false };
  }
}

function saveFilters(f: { statusFilter: ScheduleStatus | ''; typeFilter: string; chainFilter: string; sortByChain: boolean }) {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f));
  } catch {
    /**/
  }
}

export function MaintenanceScheduleTable() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ScheduleStatus | ''>(() => loadFilters().statusFilter);
  const [typeFilter, setTypeFilter] = useState<string>(() => loadFilters().typeFilter);
  const [chainFilter, setChainFilter] = useState<string>(() => loadFilters().chainFilter);
  const [sortByChain, setSortByChain] = useState<boolean>(() => loadFilters().sortByChain);
  const [isExporting, setIsExporting] = useState(false);
  const intervalHours = getDefaultIntervalHours();
  const defaultRemindBefore = getRemindBeforeHours();
  const chains = getMaintenanceChains();

  useEffect(() => {
    saveFilters({ statusFilter, typeFilter, chainFilter, sortByChain });
  }, [statusFilter, typeFilter, chainFilter, sortByChain]);

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', 'schedule'],
    queryFn: () =>
      equipmentApi.list({ limit: 500, skip: 0 }),
  });

  const rows: RowData[] = useMemo(() => {
    const list = data?.data ?? [];
    return list.map((equipment) => {
      const engineHours = equipment.engine_hours ?? null;
      const lastAt = getLastMaintenanceAtHours(engineHours, intervalHours);
      const nextAt = getNextServiceAtHours(engineHours, intervalHours);
      const remindBefore = getRemindBeforeHoursForEquipment(equipment.id, defaultRemindBefore);
      const status = getScheduleStatus(engineHours, nextAt, remindBefore);
      const chainNames = chains
        .filter((c) => c.equipmentIds.includes(equipment.id))
        .map((c) => c.name)
        .sort();
      const primaryChainName = chainNames[0] ?? '';
      return {
        equipment,
        engineHours,
        lastMaintenanceAtHours: lastAt,
        nextServiceAtHours: nextAt,
        status,
        primaryChainName,
      };
    });
  }, [data?.data, intervalHours, defaultRemindBefore, chains]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (typeFilter) {
      list = list.filter((r) => r.equipment.equipment_type === typeFilter);
    }
    if (chainFilter) {
      const chain = chains.find((c) => c.id === chainFilter);
      if (chain) {
        const idSet = new Set(chain.equipmentIds);
        list = list.filter((r) => idSet.has(r.equipment.id));
      }
    }
    return [...list].sort((a, b) => {
      if (sortByChain) {
        if (a.primaryChainName !== b.primaryChainName) {
          return a.primaryChainName.localeCompare(b.primaryChainName);
        }
      }
      const order: Record<ScheduleStatus, number> = { overdue: 0, due_soon: 1, ok: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      const nextA = a.nextServiceAtHours ?? 1e9;
      const nextB = b.nextServiceAtHours ?? 1e9;
      return nextA - nextB;
    });
  }, [rows, statusFilter, typeFilter, chainFilter, sortByChain, chains]);

  const summary = useMemo(() => {
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const dueSoon = rows.filter((r) => r.status === 'due_soon').length;
    return { overdue, dueSoon };
  }, [rows]);

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setIsExporting(true);
    try {
      if (format === 'csv') {
        downloadMaintenanceScheduleCsv(filteredRows);
      } else {
        await downloadMaintenanceScheduleXlsx(filteredRows);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <Text color="fg.muted">Загрузка...</Text>;
  }

  return (
    <Box>
      <Flex gap={3} mb={4} flexWrap="wrap" align="center">
        <Link to="/technique" search={{ section: 'maintenance-schedule' }}>
          <Button size="sm" variant="outline">
            Перейти к расписанию ТО
          </Button>
        </Link>
      </Flex>
      <Flex gap={4} mb={4} flexWrap="wrap" align="center">
        <Flex gap={2} flexWrap="wrap">
          <Badge colorPalette="red" px={2} py={1}>
            Просрочено: {summary.overdue}
          </Badge>
          <Badge colorPalette="yellow" px={2} py={1}>
            Скоро: {summary.dueSoon}
          </Badge>
        </Flex>
        <MenuRoot>
          <MenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={isExporting} aria-label="Выгрузить отчёт">
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
        <Flex gap={2} align="center" flex="1" flexWrap="wrap">
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
          <Text fontSize="sm" color="fg.muted" ml={2}>
            Последовательность ТО:
          </Text>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--chakra-colors-border)',
              fontSize: '14px',
              minWidth: '160px',
            }}
          >
            <option value="">Все</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px', fontSize: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={sortByChain}
              onChange={(e) => setSortByChain(e.target.checked)}
              aria-label="Сортировать по последовательности ТО"
            />
            <span style={{ color: 'var(--chakra-colors-fg-muted)' }}>Сортировать по последовательности</span>
          </label>
        </Flex>
      </Flex>

      <Text fontSize="sm" color="fg.muted" mb={2}>
        Следующее ТО рассчитывается по моточасам (интервал из «Расписание ТО»: {intervalHours} м/ч). Статус «Скоро» настраивается в последовательности ТО (за N м/ч до ТО). Клик по строке — переход в карточку техники.
      </Text>

      {filteredRows.length === 0 ? (
        <Text color="fg.muted">Нет техники по выбранным фильтрам.</Text>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Техника</Table.ColumnHeader>
              <Table.ColumnHeader>Тип</Table.ColumnHeader>
              <Table.ColumnHeader>Последовательность ТО</Table.ColumnHeader>
              <Table.ColumnHeader>Предыдущее ТО (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Моточасы</Table.ColumnHeader>
              <Table.ColumnHeader>След. ТО (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Осталось м/ч</Table.ColumnHeader>
              <Table.ColumnHeader>Статус</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredRows.map(({ equipment, engineHours, lastMaintenanceAtHours, nextServiceAtHours, status, primaryChainName }) => {
              const remaining =
                engineHours != null && nextServiceAtHours != null && engineHours < nextServiceAtHours
                  ? nextServiceAtHours - engineHours
                  : null;
              return (
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
                    <Text fontSize="sm">{primaryChainName || '—'}</Text>
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
                    <Text fontSize="sm">
                      {remaining != null ? remaining : status === 'overdue' ? '0' : '—'}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="sm" colorPalette={STATUS_COLOR[status]}>
                      {STATUS_LABELS[status]}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  );
}

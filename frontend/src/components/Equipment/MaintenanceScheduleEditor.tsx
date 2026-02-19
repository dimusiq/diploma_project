/**
 * Расписание ТО — сервисные периоды и последовательность ТО (графики + техника).
 */
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Input,
  Table,
  Text,
  VStack,
} from '@chakra-ui/react';
import { FiTrash2 } from 'react-icons/fi';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { equipmentApi, EQUIPMENT_TYPE_LABELS } from '@/api/equipment';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu';
import {
  CHAIN_COLOR_OPTIONS,
  DEFAULT_REMIND_BEFORE_HOURS,
  deleteMaintenanceChain,
  getChainNameForEquipment,
  getEquipmentIdsInOtherChains,
  getMaintenanceChains,
  type MaintenanceChain,
  saveMaintenanceChain,
} from '@/utils/maintenanceChains';
import { getMaintenanceIntervals, setMaintenanceIntervals } from '@/utils/maintenanceIntervals';

export function MaintenanceScheduleEditor() {
  const [intervals, setIntervals] = useState<number[]>(() => getMaintenanceIntervals());
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState('');

  const [chains, setChains] = useState<MaintenanceChain[]>(() => getMaintenanceChains());
  const [editingChainId, setEditingChainId] = useState<string | null>(null);
  const [chainName, setChainName] = useState('');
  /** Цветовое обозначение цепочки (не red/yellow/green — зарезервированы для графика ТО) */
  const [chainColorTag, setChainColorTag] = useState<string>('blue');
  /** Упорядоченная последовательность интервалов в цепочке (м/ч) */
  const [chainIntervals, setChainIntervals] = useState<number[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Set<string>>(new Set());
  const [addIntervalValue, setAddIntervalValue] = useState<number>(500);
  /** За сколько моточасов до ТО показывать «Скоро» на графике ТО (в этой цепочке). */
  const [chainRemindBeforeHours, setChainRemindBeforeHours] = useState<number>(DEFAULT_REMIND_BEFORE_HOURS);
  const [equipmentSearch, setEquipmentSearch] = useState('');

  const { data: equipmentData } = useQuery({
    queryKey: ['equipment', 'all'],
    queryFn: () => equipmentApi.list({ limit: 500, skip: 0 }),
  });
  const equipmentList = equipmentData?.data ?? [];

  useEffect(() => {
    setMaintenanceIntervals(intervals);
  }, [intervals]);

  const refreshChains = () => setChains(getMaintenanceChains());

  const handleAddInterval = () => {
    setError('');
    const num = parseInt(newValue.trim(), 10);
    if (Number.isNaN(num) || num < 1) {
      setError('Введите целое число больше 0 (моточасы)');
      return;
    }
    if (intervals.includes(num)) {
      setError('Такой период уже есть');
      return;
    }
    setIntervals((prev) => [...prev, num].sort((a, b) => a - b));
    setNewValue('');
  };

  const handleRemoveInterval = (value: number) => {
    setIntervals((prev) => prev.filter((x) => x !== value));
  };

  const startNewChain = () => {
    if (isFormDirty && !window.confirm('Есть несохранённые изменения. Переключиться без сохранения?')) return;
    setEditingChainId('new');
    setChainName('');
    setChainColorTag('blue');
    setChainRemindBeforeHours(DEFAULT_REMIND_BEFORE_HOURS);
    setChainIntervals([]);
    setAddIntervalValue(intervals[0] ?? 500);
    setSelectedEquipmentIds(new Set());
    initialFormSnapshot.current = { name: '', colorTag: 'blue', remindBeforeHours: DEFAULT_REMIND_BEFORE_HOURS, intervalHours: [], equipmentIds: [] };
  };

  const startEditChain = (chain: MaintenanceChain) => {
    setEditingChainId(chain.id);
    setChainName(chain.name);
    setChainColorTag(CHAIN_COLOR_OPTIONS.some((o) => o.value === chain.colorTag) ? chain.colorTag : 'blue');
    setChainRemindBeforeHours(chain.remindBeforeHours ?? DEFAULT_REMIND_BEFORE_HOURS);
    setChainIntervals(Array.isArray(chain.intervalHours) ? [...chain.intervalHours] : chain.intervalHours ? [chain.intervalHours] : []);
    setAddIntervalValue(intervals[0] ?? 500);
    setSelectedEquipmentIds(new Set(chain.equipmentIds));
    initialFormSnapshot.current = {
      name: chain.name,
      colorTag: chain.colorTag,
      remindBeforeHours: chain.remindBeforeHours ?? DEFAULT_REMIND_BEFORE_HOURS,
      intervalHours: Array.isArray(chain.intervalHours) ? [...chain.intervalHours] : [],
      equipmentIds: [...chain.equipmentIds].sort(),
    };
  };

  const addIntervalToChain = () => {
    setChainIntervals((prev) => [...prev, addIntervalValue]);
  };

  const removeIntervalFromChain = (index: number) => {
    setChainIntervals((prev) => prev.filter((_, i) => i !== index));
  };

  const moveChainIntervalUp = (index: number) => {
    if (index <= 0) return;
    setChainIntervals((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveChainIntervalDown = (index: number) => {
    if (index >= chainIntervals.length - 1) return;
    setChainIntervals((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const initialFormSnapshot = useRef<{ name: string; colorTag: string; remindBeforeHours: number; intervalHours: number[]; equipmentIds: string[] } | null>(null);

  const isFormDirty = useMemo(() => {
    if (editingChainId == null) return false;
    const s = initialFormSnapshot.current;
    if (!s) return false;
    const nameMatch = chainName.trim() === s.name;
    const colorMatch = chainColorTag === s.colorTag;
    const remindMatch = chainRemindBeforeHours === s.remindBeforeHours;
    const intervalsMatch =
      chainIntervals.length === s.intervalHours.length &&
      chainIntervals.every((v, i) => v === s.intervalHours[i]);
    const ids = Array.from(selectedEquipmentIds).sort();
    const equipmentMatch =
      ids.length === s.equipmentIds.length && ids.every((id, i) => id === s.equipmentIds[i]);
    return !(nameMatch && colorMatch && remindMatch && intervalsMatch && equipmentMatch);
  }, [
    editingChainId,
    chainName,
    chainColorTag,
    chainRemindBeforeHours,
    chainIntervals,
    selectedEquipmentIds,
  ]);

  const cancelChainForm = () => {
    if (isFormDirty && !window.confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return;
    initialFormSnapshot.current = null;
    setEditingChainId(null);
  };

  const handleRowClick = (c: MaintenanceChain) => {
    if (editingChainId === c.id) {
      cancelChainForm();
    } else {
      if (isFormDirty && !window.confirm('Есть несохранённые изменения. Переключиться без сохранения?')) return;
      startEditChain(c);
    }
  };

  const toggleEquipment = (id: string) => {
    setSelectedEquipmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** ID техники, которые уже в другой цепочке (не в текущей редактируемой). */
  const equipmentIdsInOtherChains = useMemo(
    () => getEquipmentIdsInOtherChains(editingChainId && editingChainId !== 'new' ? editingChainId : null),
    [editingChainId, chains]
  );

  const filteredEquipmentList = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return equipmentList;
    return equipmentList.filter(
      (e) =>
        e.brand_name?.toLowerCase().includes(q) ||
        e.model?.toLowerCase().includes(q) ||
        e.serial_number?.toLowerCase().includes(q) ||
        String(EQUIPMENT_TYPE_LABELS[e.equipment_type] ?? e.equipment_type).toLowerCase().includes(q)
    );
  }, [equipmentList, equipmentSearch]);

  const selectAllEquipment = () => {
    const availableIds = filteredEquipmentList
      .map((e) => e.id)
      .filter((id) => !equipmentIdsInOtherChains.has(id));
    if (selectedEquipmentIds.size === availableIds.length) {
      setSelectedEquipmentIds(new Set());
    } else {
      setSelectedEquipmentIds(new Set(availableIds));
    }
  };

  const handleSaveChain = () => {
    const name = chainName.trim();
    if (!name) {
      setError('Введите название последовательности');
      return;
    }
    const existing = getMaintenanceChains();
    const duplicate = existing.find(
      (c) => c.id !== (editingChainId === 'new' ? undefined : editingChainId) && c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setError('Последовательность с таким названием уже существует.');
      return;
    }
    if (chainIntervals.length === 0) {
      setError('Добавьте хотя бы один интервал в последовательность');
      return;
    }
    const inOther = Array.from(selectedEquipmentIds).filter((id) => equipmentIdsInOtherChains.has(id));
    if (inOther.length > 0) {
      const names = inOther
        .slice(0, 3)
        .map((id) => getChainNameForEquipment(id, editingChainId && editingChainId !== 'new' ? editingChainId : null))
        .filter(Boolean);
      setError(
        `Техника может входить только в одну последовательность ТО. Выбрана техника, уже добавленная в другую последовательность${names.length ? ` (например: «${names.join('», «')}»)` : ''}.`
      );
      return;
    }
    setError('');
    saveMaintenanceChain({
      id: editingChainId === 'new' ? undefined : editingChainId!,
      name,
      intervalHours: chainIntervals,
      colorTag: chainColorTag,
      remindBeforeHours: chainRemindBeforeHours,
      equipmentIds: Array.from(selectedEquipmentIds),
    });
    refreshChains();
    initialFormSnapshot.current = null;
    setEditingChainId(null);
  };

  const handleDeleteChain = (id: string) => {
    if (window.confirm('Удалить эту последовательность ТО?')) {
      deleteMaintenanceChain(id);
      refreshChains();
      if (editingChainId === id) setEditingChainId(null);
    }
  };

  return (
    <Box>
      <Flex gap={3} mb={4} flexWrap="wrap" align="center">
        <Link to="/technique" search={{ section: 'maintenance' }}>
          <Button size="sm" variant="outline">
            Перейти к графику ТО
          </Button>
        </Link>
        <Flex gap={2} align="center">
          <Text as="span" fontSize="sm" color="fg.muted">
            Разделы:
          </Text>
          <a href="#sequence-to">
            <Button size="xs" variant="ghost">
              Последовательность ТО
            </Button>
          </a>
          <a href="#service-periods">
            <Button size="xs" variant="ghost">
              Сервисные периоды
            </Button>
          </a>
        </Flex>
      </Flex>
      <VStack align="stretch" gap={8}>
        {/* Последовательность ТО — выше на странице */}
        <Box id="sequence-to">
          <Heading size="sm" mb={2}>
            Последовательность ТО
          </Heading>
          <Text fontSize="sm" color="fg.muted" mb={4}>
            Создайте последовательности из графика (интервала) и назначьте технику. Одна последовательность — один интервал и список техники.
          </Text>

          <Button size="sm" mb={4} onClick={startNewChain}>
            Создать последовательность ТО
          </Button>
          {chains.length === 0 ? (
            <Box mb={4} p={4} borderRadius="md" borderWidth="1px" borderStyle="dashed" borderColor="border" textAlign="center">
              <Text fontSize="sm" color="fg.muted" mb={2}>
                Нет последовательностей.
              </Text>
              <Text fontSize="sm" color="fg.muted" mb={3}>
                Создайте первую последовательность, выберите интервалы и назначьте технику.
              </Text>
              <Button size="sm" onClick={startNewChain}>
                Создать последовательность ТО
              </Button>
            </Box>
          ) : (
            <Table.Root size="sm" mb={4}>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Название</Table.ColumnHeader>
                  <Table.ColumnHeader>Интервалы (м/ч)</Table.ColumnHeader>
                  <Table.ColumnHeader>Напоминание за (м/ч)</Table.ColumnHeader>
                  <Table.ColumnHeader>Техника</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Действия</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {chains.map((c) => (
                  <Table.Row
                    key={c.id}
                    cursor="pointer"
                    _hover={{ bg: 'gray.subtle' }}
                    _active={{ bg: 'gray.muted' }}
                    bg={editingChainId === c.id ? 'blue.subtle' : undefined}
                    onClick={() => handleRowClick(c)}
                  >
                    <Table.Cell>
                      <Flex gap={2} align="center">
                        <Badge
                          size="sm"
                          colorPalette={CHAIN_COLOR_OPTIONS.some((o) => o.value === c.colorTag) ? (c.colorTag as 'blue' | 'purple' | 'orange' | 'cyan' | 'teal' | 'pink' | 'violet' | 'indigo') : 'blue'}
                          title="Цветовое обозначение цепочки"
                        >
                          {' '}
                        </Badge>
                        <Text fontWeight="medium">{c.name}</Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {c.intervalHours.length > 0 ? c.intervalHours.join(' → ') : '—'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">{c.remindBeforeHours ?? DEFAULT_REMIND_BEFORE_HOURS}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">{c.equipmentIds.length} ед.</Text>
                    </Table.Cell>
                    <Table.Cell textAlign="right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => handleDeleteChain(c.id)}
                        title="Удалить"
                        aria-label="Удалить последовательность"
                        px={1.5}
                      >
                        <FiTrash2 />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}

          {editingChainId != null && (
            <Box
              p={4}
              borderRadius="md"
              borderWidth="1px"
              borderColor="border"
              bg="bg.subtle"
              w="100%"
            >
              <Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={2}>
                <Heading size="xs">
                  {editingChainId === 'new' ? 'Новая последовательность ТО' : `Редактирование: ${chainName || '—'}`}
                </Heading>
                <Button size="sm" variant="ghost" onClick={cancelChainForm} aria-label="Закрыть форму">
                  Закрыть
                </Button>
              </Flex>
              <VStack align="stretch" gap={4}>
                <Flex gap={2} align="center" flexWrap="wrap">
                  <Text fontWeight="medium" fontSize="sm" w="100px">
                    Название:
                  </Text>
                  <Input
                    size="sm"
                    placeholder="Например: ТО каждые 500 м/ч"
                    value={chainName}
                    onChange={(e) => setChainName(e.target.value)}
                    flex="1"
                    minW="200px"
                  />
                </Flex>
                <Flex gap={2} align="center" flexWrap="wrap">
                  <Text fontWeight="medium" fontSize="sm" w="100px">
                    Цветовое обозначение последовательности ТО:
                  </Text>
                  <MenuRoot>
                    <MenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        cursor="pointer"
                        px={3}
                        py={1.5}
                        minW="140px"
                        justifyContent="flex-start"
                        gap={2}
                      >
                        <Badge
                          size="md"
                          colorPalette={chainColorTag as 'blue' | 'purple' | 'orange' | 'cyan' | 'teal' | 'pink' | 'violet' | 'indigo'}
                        >
                          {CHAIN_COLOR_OPTIONS.find((o) => o.value === chainColorTag)?.label ?? chainColorTag}
                        </Badge>
                        <Text as="span" fontSize="sm" color="fg.muted">
                          ▼
                        </Text>
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      {CHAIN_COLOR_OPTIONS.map((opt) => (
                        <MenuItem
                          key={opt.value}
                          value={opt.value}
                          onClick={() => setChainColorTag(opt.value)}
                        >
                          <Badge
                            size="md"
                            colorPalette={opt.value as 'blue' | 'purple' | 'orange' | 'cyan' | 'teal' | 'pink' | 'violet' | 'indigo'}
                          >
                            {opt.label}
                          </Badge>
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </MenuRoot>
                </Flex>
                <Flex gap={2} align="center" flexWrap="wrap">
                  <Text fontWeight="medium" fontSize="sm" w="100px">
                    Напоминание в графике ТО:
                  </Text>
                  <Text fontSize="sm">за</Text>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    w="90px"
                    size="sm"
                    value={chainRemindBeforeHours}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n) && n >= 0) setChainRemindBeforeHours(n);
                    }}
                  />
                  <Text fontSize="sm" color="fg.muted">
                    моточасов до ТО (статус «Скоро»)
                  </Text>
                </Flex>
                <Box>
                  <Text fontWeight="medium" fontSize="sm" mb={2}>
                    Последовательность интервалов (м/ч):
                  </Text>
                  <Text fontSize="xs" color="fg.muted" mb={2}>
                    Порядок можно менять кнопками ↑ ↓. Первый интервал используется для расчёта «следующее ТО» в графике.
                  </Text>
                  <Flex gap={2} align="center" flexWrap="wrap" mb={2}>
                    <select
                      value={addIntervalValue}
                      onChange={(e) => setAddIntervalValue(Number(e.target.value))}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--chakra-colors-border)',
                        fontSize: '14px',
                        minWidth: '120px',
                      }}
                    >
                      {intervals.map((val) => (
                        <option key={val} value={val}>
                          {val} м/ч
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" onClick={addIntervalToChain}>
                      Добавить в цепочку
                    </Button>
                  </Flex>
                  {chainIntervals.length === 0 ? (
                    <Text fontSize="sm" color="fg.muted">
                      Нет интервалов. Выберите интервал выше и нажмите «Добавить в цепочку».
                    </Text>
                  ) : (
                    <VStack align="stretch" gap={1}>
                      {chainIntervals.map((val, index) => (
                        <Flex key={`${val}-${index}`} gap={2} align="center">
                          <Badge size="md" colorPalette="blue">
                            {val} м/ч
                          </Badge>
                          <Button size="xs" variant="ghost" onClick={() => moveChainIntervalUp(index)} title="Поднять">
                            ↑
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => moveChainIntervalDown(index)} title="Опустить">
                            ↓
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="red"
                            onClick={() => removeIntervalFromChain(index)}
                            title="Удалить"
                            aria-label="Удалить интервал из последовательности"
                            px={1.5}
                          >
                            <FiTrash2 />
                          </Button>
                        </Flex>
                      ))}
                    </VStack>
                  )}
                </Box>
                <Box>
                  <Flex align="center" gap={2} mb={2} flexWrap="wrap">
                    <Text fontWeight="medium" fontSize="sm">
                      Техника в последовательности:
                    </Text>
                    <Button size="xs" variant="outline" onClick={selectAllEquipment}>
                      {selectedEquipmentIds.size === filteredEquipmentList.filter((e) => !equipmentIdsInOtherChains.has(e.id)).length ? 'Снять все' : 'Выбрать всю'}
                    </Button>
                  </Flex>
                  <Input
                    size="sm"
                    placeholder="Поиск по названию, модели, серийному номеру..."
                    value={equipmentSearch}
                    onChange={(e) => setEquipmentSearch(e.target.value)}
                    mb={2}
                    maxW="320px"
                  />
                  <Text fontSize="xs" color="fg.muted" mb={2}>
                    Техника может входить только в одну последовательность ТО. Занятая в другой последовательности техника недоступна для выбора.
                  </Text>
                  <Box
                    maxH="400px"
                    overflowY="auto"
                    borderWidth="1px"
                    borderColor="border"
                    borderRadius="md"
                    p={2}
                    bg="bg"
                  >
                    {equipmentList.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted">
                        Нет техники. Добавьте технику в разделе «Список техники».
                      </Text>
                    ) : filteredEquipmentList.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted">
                        Ничего не найдено по запросу. Измените поиск.
                      </Text>
                    ) : (
                      <Grid
                        templateColumns="repeat(3, 1fr)"
                        gap={2}
                        alignContent="start"
                      >
                        {filteredEquipmentList.map((eq) => {
                          const inOtherChain = equipmentIdsInOtherChains.has(eq.id);
                          const otherChainName = inOtherChain
                            ? getChainNameForEquipment(
                                eq.id,
                                editingChainId && editingChainId !== 'new' ? editingChainId : null
                              )
                            : null;
                          return (
                            <Checkbox
                              key={eq.id}
                              checked={selectedEquipmentIds.has(eq.id)}
                              disabled={inOtherChain}
                              onCheckedChange={() => !inOtherChain && toggleEquipment(eq.id)}
                            >
                              <Text fontSize="sm" opacity={inOtherChain ? 0.7 : 1}>
                                {eq.brand_name} {eq.model}
                                {eq.serial_number && (
                                  <Text as="span" color="fg.muted" ml={2}>
                                    ({eq.serial_number})
                                  </Text>
                                )}
                                {' · '}
                                {EQUIPMENT_TYPE_LABELS[eq.equipment_type] ?? eq.equipment_type}
                                {otherChainName && (
                                  <Text as="span" fontSize="xs" color="fg.muted" display="block" mt={0.5}>
                                    в цепочке «{otherChainName}»
                                  </Text>
                                )}
                              </Text>
                            </Checkbox>
                          );
                        })}
                      </Grid>
                    )}
                  </Box>
                </Box>
                {error && (
                  <Text fontSize="sm" color="red">
                    {error}
                  </Text>
                )}
                <Flex gap={2}>
                  <Button size="sm" onClick={handleSaveChain}>
                    Сохранить
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelChainForm}>
                    Отмена
                  </Button>
                </Flex>
              </VStack>
            </Box>
          )}
        </Box>

        {/* Сервисные периоды */}
        <Box id="service-periods">
          <Heading size="sm" mb={2}>
            Сервисные периоды (м/ч)
          </Heading>
          <Text fontSize="sm" color="fg.muted" mb={4}>
            Отметки в моточасах для ТО (500, 1000, 1500 и т.д.). Первый период используется в «График ТО» по умолчанию.
          </Text>
          <Flex gap={2} align="center" flexWrap="wrap" mb={2}>
            <Input
              type="number"
              min={1}
              step={100}
              placeholder="Моточасы (например 500)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddInterval())}
              size="sm"
              w="180px"
            />
            <Button size="sm" onClick={handleAddInterval}>
              Добавить период
            </Button>
          </Flex>
          {error && !editingChainId && (
            <Text fontSize="sm" color="red" mb={2}>
              {error}
            </Text>
          )}
          {intervals.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              Нет периодов. Добавьте первый (например 500).
            </Text>
          ) : (
            <Table.Root size="sm" w="auto">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Период (м/ч)</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Действие</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {intervals.map((value) => (
                  <Table.Row key={value}>
                    <Table.Cell>
                      <Badge size="md" colorPalette="blue">
                        {value}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell textAlign="right">
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => handleRemoveInterval(value)}
                      >
                        Удалить
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </VStack>
    </Box>
  );
}

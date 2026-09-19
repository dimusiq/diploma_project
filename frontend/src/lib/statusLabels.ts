/**
 * Русские подписи статусов и enum для UI.
 * Значения API/backend не меняются: helpers только для presentation.
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"

export type StatusMeta = {
  label: string
  tone: StatusTone
}

/** Складские задания WMS (`WarehouseTask.status`). */
export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  queued: "В очереди",
  created: "Создано",
  assigned: "Назначено",
  in_progress: "Выполняется",
  blocked: "Заблокировано",
  blocking: "Блокирует",
  completed: "Завершено",
  done: "Завершено",
  failed: "Ошибка",
  cancelled: "Отменено",
  canceled: "Отменено",
}

/** Типы складских заданий (`WarehouseTask.task_type` / sim task.kind). */
export const TASK_TYPE_LABELS: Record<string, string> = {
  pick: "Отбор",
  putaway: "Размещение",
  move: "Перемещение",
  replenish: "Пополнение",
  count: "Инвентаризация",
  other: "Прочее",
  unload: "Разгрузка",
  load: "Погрузка",
  charge: "Заряд",
}

/** Исходящие заказы (`OutboundOrder.status`). */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  open: "Открыт",
  new: "Новый",
  backorder: "Нет запаса",
  picking: "Комплектация",
  packing: "Упаковка",
  packed: "Готов к отгрузке",
  staged: "В буфере",
  loading: "Погрузка",
  shipped: "Отгружен",
  closed: "Закрыт",
  cancelled: "Отменён",
  canceled: "Отменён",
}

/** Входящие заказы (`InboundOrder.status` и sim inbound). */
export const INBOUND_ORDER_STATUS_LABELS: Record<string, string> = {
  open: "Открыт",
  awaiting: "Ожидает ворот",
  in_progress: "В работе",
  unloading: "Разгрузка",
  received: "Получен",
  closed: "Закрыт",
  cancelled: "Отменён",
  canceled: "Отменён",
}

/** WMS-статусы товара (`Item.status`). */
export const ITEM_STATUS_LABELS: Record<string, string> = {
  incoming: "Поступления",
  warehouse: "Склад",
  shipment: "Отгрузка",
  shipped: "Отгружено",
  stored: "На складе",
  reserved: "Зарезервирован",
  defective: "Брак",
}

/** Заявки на обслуживание. */
export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  open: "Открыта",
  in_progress: "В работе",
  waiting_parts: "Ожидание запчастей",
  done: "Выполнена",
  canceled: "Отменена",
}

export const WORK_ORDER_PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
}

export const PRIORITY_LABELS: Record<string, string> = {
  ...WORK_ORDER_PRIORITY_LABELS,
  normal: "Обычный",
  urgent: "Срочный",
}

export const SEVERITY_LABELS: Record<string, string> = {
  info: "Информация",
  success: "Успех",
  warning: "Предупреждение",
  error: "Ошибка",
  critical: "Критическое",
}

/** Жизненный цикл единицы техники. */
export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  active: "В эксплуатации",
  maintenance: "На обслуживании",
  decommissioned: "Выведена из эксплуатации",
  live: "Онлайн",
}

/** Состояния устройств симулятора / Device Monitor. */
export const DEVICE_STATUS_LABELS: Record<string, string> = {
  online: "В сети",
  offline: "Не в сети",
  idle: "Простаивает",
  busy: "Занят",
  moving: "В движении",
  waiting: "Ждёт разъезда",
  loading: "Захват груза",
  unloading: "Выгрузка",
  charging: "Заряжается",
  running: "Работает",
  scanning: "Сканирование",
  occupied: "Занято",
  jam: "Замятие",
  fault: "Отказ",
  error: "Ошибка",
  maintenance: "На обслуживании",
}

/** Подтипы датчиков (`metricKind`). */
export const SENSOR_METRIC_LABELS: Record<string, string> = {
  temperature: "Температура",
  humidity: "Влажность",
  vibration: "Вибрация",
  weight: "Вес",
  co2: "CO₂",
  photo_eye: "Фотобарьер",
}

export const SIM_MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  preventive: "Плановое ТО",
  corrective: "Ремонт",
  inspection: "Осмотр",
  emergency: "Аварийное",
}

export const SIM_MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  planned: "Запланировано",
  scheduled: "Назначено",
  in_progress: "Выполняется",
  completed: "Завершено",
  cancelled: "Отменено",
}

/** Состояние прогона симуляции (`SimRunState` и lowercase). */
export const SIMULATION_STATUS_LABELS: Record<string, string> = {
  stopped: "Остановлено",
  running: "Выполняется",
  paused: "Приостановлено",
  connected: "Подключено",
  reconnecting: "Переподключение",
}

/** Inbox интеграций и служебные event status. */
export const EVENT_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  processing: "Обрабатывается",
  processed: "Обработано",
  failed: "Ошибка",
  error: "Ошибка",
  ignored: "Пропущено",
  ignored_duplicate: "Дубликат",
  completed: "Завершено",
  executed: "Выполнено",
}

/** Отгрузки / транспорт (`Shipment.status`). */
export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  planned: "Запланирована",
  queued: "В очереди",
  arrived: "Прибыла",
  docked: "У ворот",
  unloading: "Разгрузка",
  loading: "Погрузка",
  departed: "Уехала",
  shipped: "Отгружена",
  cancelled: "Отменена",
  canceled: "Отменена",
}

export const TRUCK_STATUS_LABELS: Record<string, string> = {
  queued: "В очереди",
  docked: "У ворот",
  unloading: "Разгрузка",
  loading: "Погрузка",
  departed: "Уехала",
}

export const WORKER_STATUS_LABELS: Record<string, string> = {
  idle: "Свободен",
  busy: "Занят",
  break: "Перерыв",
  off_shift: "Не в смене",
}

export const STEP_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  complete: "Завершено",
  completed: "Завершено",
}

export const CONNECTION_STATUS_LABELS: Record<string, string> = {
  live: "Поток активен",
  connecting: "Подключение…",
  no_token: "Нет токена",
  offline: "Нет соединения",
  idle: "Ожидание",
}

/** График ТО. */
export const MAINTENANCE_SCHEDULE_STATUS_LABELS: Record<string, string> = {
  in_repair: "В ремонте",
  overdue: "Просрочено",
  due_soon: "Скоро",
  ok: "Норма",
}

/** Известные типы событий симулятора / журнала. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  TASK_CREATED: "Задание создано",
  TASK_ASSIGNED: "Задание назначено",
  TASK_STARTED: "Задание начато",
  TASK_COMPLETED: "Задание завершено",
  TASK_FAILED: "Задание с ошибкой",
  TASK_BLOCKED: "Задание заблокировано",
  DEVICE_ERROR: "Ошибка устройства",
  DEVICE_ONLINE: "Устройство в сети",
  DEVICE_OFFLINE: "Устройство не в сети",
  AGV_CHARGING: "AGV на зарядке",
  CONVEYOR_JAM: "Замятие конвейера",
  ORDER_CREATED: "Заказ создан",
  ORDER_PICKING: "Комплектация заказа",
  ORDER_SHIPPED: "Заказ отгружен",
  PICKING_STARTED: "Отбор начат",
  PICKING_COMPLETED: "Отбор завершён",
  ITEM_SHIPPED: "Товар отгружен",
  ITEM_PACKED: "Товар упакован",
  ITEM_RECEIVED: "Товар принят",
  ITEM_SCANNED: "Товар отсканирован",
  ITEM_STORED: "Товар размещён",
  ITEM_PICKED: "Товар отобран",
  RECEIVING_STARTED: "Приёмка начата",
  RECEIVING_COMPLETED: "Приёмка завершена",
  TRUCK_ARRIVED: "Машина прибыла",
  TRUCK_DEPARTED: "Машина уехала",
  STORAGE_FULL: "Зона хранения заполнена",
  SYSTEM_STARTED: "Система запущена",
  SYSTEM_STOPPED: "Система остановлена",
  SYSTEM_PAUSED: "Система приостановлена",
  EMERGENCY_STOP: "Аварийный стоп",
  SENSOR_READING: "Показание датчика",
  SENSOR_ALARM: "Тревога датчика",
  WORKER_BREAK: "Перерыв сотрудника",
  ZONE_CHANGED: "Смена зоны",
}

const GENERIC_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  queued: "В очереди",
  created: "Создано",
  assigned: "Назначено",
  in_progress: "Выполняется",
  active: "Активен",
  inactive: "Неактивен",
  completed: "Завершено",
  complete: "Завершено",
  done: "Завершено",
  failed: "Ошибка",
  error: "Ошибка",
  cancelled: "Отменено",
  canceled: "Отменено",
  blocked: "Заблокировано",
  blocking: "Блокирует",
  waiting: "Ожидание",
  ready: "Готово",
  running: "Выполняется",
  stopped: "Остановлено",
  paused: "Приостановлено",
  online: "В сети",
  offline: "Не в сети",
  busy: "Занят",
  idle: "Простаивает",
  charging: "Заряжается",
  maintenance: "На обслуживании",
  warning: "Предупреждение",
  critical: "Критический",
  success: "Успех",
  info: "Информация",
  open: "Открыт",
  closed: "Закрыт",
  processed: "Обработано",
  processing: "Обрабатывается",
}

const TONE_BY_KEY: Record<string, StatusTone> = {
  pending: "warning",
  queued: "warning",
  waiting: "warning",
  blocked: "danger",
  blocking: "warning",
  failed: "danger",
  error: "danger",
  fault: "danger",
  jam: "danger",
  cancelled: "neutral",
  canceled: "neutral",
  completed: "success",
  complete: "success",
  done: "success",
  shipped: "success",
  received: "success",
  processed: "success",
  success: "success",
  in_progress: "info",
  running: "info",
  assigned: "info",
  packed: "info",
  picking: "info",
  packing: "info",
  ready: "info",
  paused: "warning",
  stopped: "neutral",
  offline: "neutral",
  idle: "neutral",
  open: "info",
  warning: "warning",
  critical: "danger",
  overdue: "danger",
  due_soon: "warning",
  ok: "success",
  maintenance: "warning",
}

function warnUnknown(kind: string, value: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[statusLabels] неизвестное значение ${kind}:`, value)
  }
}

export function normalizeStatusKey(value: string): string {
  return value.trim().toLowerCase()
}

function lookup(
  map: Record<string, string>,
  value: string | null | undefined,
  kind: string,
): string {
  if (value == null || value === "") return ""
  const exact = map[value]
  if (exact) return exact
  const key = normalizeStatusKey(value)
  const folded = map[key]
  if (folded) return folded
  warnUnknown(kind, value)
  return value
}

export function getTaskStatusLabel(status: string): string {
  return lookup(TASK_STATUS_LABELS, status, "task.status")
}

export function getTaskTypeLabel(taskType: string): string {
  return lookup(TASK_TYPE_LABELS, taskType, "task.task_type")
}

export function getOrderStatusLabel(status: string): string {
  return lookup(ORDER_STATUS_LABELS, status, "order.status")
}

export function getInboundOrderStatusLabel(status: string): string {
  return lookup(INBOUND_ORDER_STATUS_LABELS, status, "inbound.status")
}

export function getItemStatusLabel(status: string): string {
  return lookup(ITEM_STATUS_LABELS, status, "item.status")
}

export function getWorkOrderStatusLabel(status: string): string {
  const key = normalizeStatusKey(status)
  if (key === "cancelled") {
    return lookup(WORK_ORDER_STATUS_LABELS, "canceled", "work_order.status")
  }
  return lookup(WORK_ORDER_STATUS_LABELS, status, "work_order.status")
}

export function getDeviceStatusLabel(status: string): string {
  return lookup(DEVICE_STATUS_LABELS, status, "device.status")
}

export function getSensorMetricLabel(metricKind: string): string {
  return lookup(SENSOR_METRIC_LABELS, metricKind, "sensor.metricKind")
}

export function getSimMaintenanceTypeLabel(type: string): string {
  return lookup(SIM_MAINTENANCE_TYPE_LABELS, type, "sim.maintenance.type")
}

export function getSimMaintenanceStatusLabel(status: string): string {
  return lookup(SIM_MAINTENANCE_STATUS_LABELS, status, "sim.maintenance.status")
}

export function getSimulationStatusLabel(
  status: string,
  opts?: { uppercase?: boolean },
): string {
  const label = lookup(SIMULATION_STATUS_LABELS, status, "simulation.state")
  return opts?.uppercase ? label.toLocaleUpperCase("ru-RU") : label
}

export function getEventStatusLabel(status: string): string {
  return lookup(EVENT_STATUS_LABELS, status, "event.status")
}

export function getPriorityLabel(priority: string | number): string {
  if (typeof priority === "number") {
    if (priority >= 8) return "Критический"
    if (priority >= 5) return "Высокий"
    if (priority >= 3) return "Средний"
    return "Низкий"
  }
  return lookup(PRIORITY_LABELS, priority, "priority")
}

export function getSeverityLabel(severity: string): string {
  return lookup(SEVERITY_LABELS, severity, "severity")
}

export function getEquipmentStatusLabel(status: string): string {
  return lookup(EQUIPMENT_STATUS_LABELS, status, "equipment.status")
}

export function getShipmentStatusLabel(status: string): string {
  return lookup(SHIPMENT_STATUS_LABELS, status, "shipment.status")
}

export function getTruckStatusLabel(status: string): string {
  return lookup(TRUCK_STATUS_LABELS, status, "truck.status")
}

export function getWorkerStatusLabel(status: string): string {
  return lookup(WORKER_STATUS_LABELS, status, "worker.status")
}

export function getStepStatusLabel(status: string): string {
  return lookup(STEP_STATUS_LABELS, status, "step.status")
}

export function getConnectionStatusLabel(status: string): string {
  return lookup(CONNECTION_STATUS_LABELS, status, "connection.status")
}

export function getMaintenanceScheduleStatusLabel(status: string): string {
  return lookup(
    MAINTENANCE_SCHEDULE_STATUS_LABELS,
    status,
    "maintenance.status",
  )
}

export function getEventTypeLabel(eventType: string): string {
  if (!eventType) return ""
  const exact = EVENT_TYPE_LABELS[eventType]
  if (exact) return exact
  const upper = eventType.toUpperCase()
  const folded = EVENT_TYPE_LABELS[upper]
  if (folded) return folded
  return eventType
}

/** Универсальный UI-helper, если домен неизвестен. Неизвестное значение не ломает UI. */
export function getStatusLabel(status: string): string {
  return lookup(GENERIC_STATUS_LABELS, status, "status")
}

export function getStatusTone(status: string): StatusTone {
  const key = normalizeStatusKey(status)
  return TONE_BY_KEY[key] ?? "neutral"
}

export function getStatusMeta(
  status: string,
  labels: Record<string, string> = GENERIC_STATUS_LABELS,
): StatusMeta {
  const label = lookup(labels, status, "status")
  return { label, tone: getStatusTone(status) }
}

export function getTaskStatusMeta(status: string): StatusMeta {
  return getStatusMeta(status, TASK_STATUS_LABELS)
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/15 text-destructive",
}

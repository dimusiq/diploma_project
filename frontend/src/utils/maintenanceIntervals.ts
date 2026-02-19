/**
 * Сервисные периоды ТО (м/ч). Хранятся в localStorage, используются в «График ТО» и «Расписание ТО».
 */
const STORAGE_KEY = 'maintenance_intervals';
const DEFAULT_INTERVALS = [500, 1000, 1500, 2000, 2500];

function parseStored(value: string | null): number[] {
  if (!value) return DEFAULT_INTERVALS;
  try {
    const arr = JSON.parse(value) as unknown;
    if (!Array.isArray(arr)) return DEFAULT_INTERVALS;
    const numbers = arr.filter((x): x is number => typeof x === 'number' && x > 0 && Number.isInteger(x));
    return numbers.length > 0 ? [...new Set(numbers)].sort((a, b) => a - b) : DEFAULT_INTERVALS;
  } catch {
    return DEFAULT_INTERVALS;
  }
}

export function getMaintenanceIntervals(): number[] {
  if (typeof window === 'undefined') return DEFAULT_INTERVALS;
  return parseStored(localStorage.getItem(STORAGE_KEY));
}

export function setMaintenanceIntervals(intervals: number[]): void {
  const valid = [...new Set(intervals)].filter((x) => x > 0 && Number.isInteger(x)).sort((a, b) => a - b);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(valid.length > 0 ? valid : DEFAULT_INTERVALS));
}

/** Интервал для расчёта «следующее ТО» в графике (первый из списка или 500) */
export function getDefaultIntervalHours(): number {
  const list = getMaintenanceIntervals();
  return list[0] ?? 500;
}

const REMIND_BEFORE_KEY = 'maintenance_remind_before_hours';
const DEFAULT_REMIND_BEFORE_HOURS = 50;

/** За сколько моточасов до ТО показывать напоминание «Скоро» на графике ТО */
export function getRemindBeforeHours(): number {
  if (typeof window === 'undefined') return DEFAULT_REMIND_BEFORE_HOURS;
  const raw = localStorage.getItem(REMIND_BEFORE_KEY);
  if (raw == null) return DEFAULT_REMIND_BEFORE_HOURS;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? DEFAULT_REMIND_BEFORE_HOURS : n;
}

export function setRemindBeforeHours(hours: number): void {
  const value = Math.max(0, Math.floor(hours));
  localStorage.setItem(REMIND_BEFORE_KEY, String(value));
}

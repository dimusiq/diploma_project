/**
 * Детерминированный генератор случайных чисел (mulberry32).
 *
 * Состояние хранится в мире (`world.rngState`), поэтому один и тот же seed
 * даёт один и тот же сценарий — это нужно для воспроизводимых прогонов и тестов.
 */

export interface RngHolder {
  rngState: number
}

export function nextRandom(holder: RngHolder): number {
  holder.rngState = (holder.rngState + 0x6d2b79f5) | 0
  let t = holder.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Случайное число в диапазоне [min, max). */
export function randRange(holder: RngHolder, min: number, max: number): number {
  return min + nextRandom(holder) * (max - min)
}

/** Случайное целое в диапазоне [min, max] включительно. */
export function randInt(holder: RngHolder, min: number, max: number): number {
  return Math.floor(randRange(holder, min, max + 1))
}

export function randChance(holder: RngHolder, probability: number): boolean {
  return nextRandom(holder) < probability
}

export function randPick<T>(holder: RngHolder, items: readonly T[]): T {
  return items[
    Math.min(items.length - 1, Math.floor(nextRandom(holder) * items.length))
  ]
}

/**
 * Вероятность хотя бы одного события за `dtSec` при интенсивности
 * `ratePerHour` (экспоненциальное распределение интервалов).
 */
export function eventOccurs(
  holder: RngHolder,
  ratePerHour: number,
  dtSec: number,
): boolean {
  if (ratePerHour <= 0) return false
  const lambda = ratePerHour / 3600
  return randChance(holder, 1 - Math.exp(-lambda * dtSec))
}

/** Нормальное распределение (Box–Muller), обрезанное по [min, max]. */
export function randNormal(
  holder: RngHolder,
  mean: number,
  sd: number,
  min: number,
  max: number,
): number {
  const u1 = Math.max(1e-9, nextRandom(holder))
  const u2 = nextRandom(holder)
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.min(max, Math.max(min, mean + z * sd))
}

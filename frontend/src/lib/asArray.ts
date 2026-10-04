/**
 * Нормализует значение к массиву: не-массив / null / undefined → [].
 * Защищает списки от падения на `.map` / `.filter` при кривом ответе API.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

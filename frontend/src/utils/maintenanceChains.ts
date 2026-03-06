/**
 * Последовательность ТО — именованные графики с упорядоченным списком интервалов и привязанной техникой. Хранятся в localStorage.
 */

/** Цвета, зарезервированные для графика ТО (статусы: просрочено, скоро, норма). Теги цепочек их не используют. */
export const GRAPH_STATUS_COLORS = ["red", "yellow", "green"] as const

/** Допустимые цветовые теги для последовательности ТО (не пересекаются с графиком ТО). */
export const CHAIN_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "blue", label: "Синий" },
  { value: "purple", label: "Фиолетовый" },
  { value: "orange", label: "Оранжевый" },
  { value: "cyan", label: "Бирюзовый" },
  { value: "teal", label: "Болотный" },
  { value: "pink", label: "Розовый" },
  { value: "violet", label: "Фиалковый" },
  { value: "indigo", label: "Индиго" },
]

const STORAGE_KEY = "maintenance_chains"
const DEFAULT_CHAIN_COLOR = "blue"
export const DEFAULT_REMIND_BEFORE_HOURS = 50

export interface MaintenanceChain {
  id: string
  name: string
  /** Упорядоченная последовательность интервалов (м/ч): 500, 1000, 1500 и т.д. */
  intervalHours: number[]
  /** Цветовое обозначение цепочки (не red/yellow/green — они зарезервированы для графика ТО). */
  colorTag: string
  /** За сколько моточасов до ТО показывать статус «Скоро» на графике ТО. */
  remindBeforeHours: number
  equipmentIds: string[]
}

function generateId(): string {
  return `chain_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function normalizeIntervalHours(val: unknown): number[] {
  if (Array.isArray(val)) {
    const nums = val.filter(
      (x): x is number => typeof x === "number" && x > 0 && Number.isInteger(x),
    )
    return nums
  }
  if (typeof val === "number" && val > 0) return [val]
  return []
}

function parseStored(value: string | null): MaintenanceChain[] {
  if (!value) return []
  try {
    const arr = JSON.parse(value) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (x): x is Record<string, unknown> =>
          typeof x === "object" &&
          x != null &&
          typeof (x as Record<string, unknown>).id === "string" &&
          typeof (x as Record<string, unknown>).name === "string",
      )
      .map((x) => {
        const color =
          typeof x.colorTag === "string" &&
          x.colorTag &&
          !GRAPH_STATUS_COLORS.includes(
            x.colorTag as (typeof GRAPH_STATUS_COLORS)[number],
          )
            ? x.colorTag
            : DEFAULT_CHAIN_COLOR
        const remind =
          typeof x.remindBeforeHours === "number" && x.remindBeforeHours >= 0
            ? x.remindBeforeHours
            : DEFAULT_REMIND_BEFORE_HOURS
        return {
          id: x.id as string,
          name: String(x.name),
          intervalHours: normalizeIntervalHours(x.intervalHours),
          colorTag: color,
          remindBeforeHours: remind,
          equipmentIds: Array.isArray(x.equipmentIds)
            ? (x.equipmentIds as string[])
            : [],
        }
      })
  } catch {
    return []
  }
}

export function getMaintenanceChains(): MaintenanceChain[] {
  if (typeof window === "undefined") return []
  return parseStored(localStorage.getItem(STORAGE_KEY))
}

export function saveMaintenanceChain(
  chain: Omit<MaintenanceChain, "id"> & { id?: string },
): MaintenanceChain {
  const list = getMaintenanceChains()
  const id = chain.id ?? generateId()
  const allowedColors = CHAIN_COLOR_OPTIONS.map((o) => o.value)
  const colorTag =
    typeof chain.colorTag === "string" && allowedColors.includes(chain.colorTag)
      ? chain.colorTag
      : DEFAULT_CHAIN_COLOR
  const remindBeforeHours =
    typeof chain.remindBeforeHours === "number" && chain.remindBeforeHours >= 0
      ? chain.remindBeforeHours
      : DEFAULT_REMIND_BEFORE_HOURS
  const newChain: MaintenanceChain = {
    id,
    name: String(chain.name).trim(),
    intervalHours: Array.isArray(chain.intervalHours)
      ? chain.intervalHours.filter((x) => x > 0 && Number.isInteger(x))
      : [],
    colorTag,
    remindBeforeHours,
    equipmentIds: Array.isArray(chain.equipmentIds) ? chain.equipmentIds : [],
  }
  const index = list.findIndex((c) => c.id === id)
  const next =
    index >= 0
      ? list.map((c, i) => (i === index ? newChain : c))
      : [...list, newChain]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return newChain
}

export function deleteMaintenanceChain(id: string): void {
  const next = getMaintenanceChains().filter((c) => c.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function getMaintenanceChain(id: string): MaintenanceChain | undefined {
  return getMaintenanceChains().find((c) => c.id === id)
}

/** Для техники: минимум remindBeforeHours по всем цепочкам, в которых она есть; иначе defaultRemind. */
export function getRemindBeforeHoursForEquipment(
  equipmentId: string,
  defaultRemind: number,
  chains?: MaintenanceChain[],
): number {
  const list = chains ?? getMaintenanceChains()
  const inChains = list.filter((c) => c.equipmentIds.includes(equipmentId))
  if (inChains.length === 0) return defaultRemind
  return Math.min(...inChains.map((c) => c.remindBeforeHours))
}

/** ID техники, которые уже входят в другие цепочки (кроме excludeChainId). excludeChainId = null — все цепочки. */
export function getEquipmentIdsInOtherChains(
  excludeChainId: string | null,
  chains?: MaintenanceChain[],
): Set<string> {
  const list = chains ?? getMaintenanceChains()
  const filtered = list.filter((c) => c.id !== excludeChainId)
  const set = new Set<string>()
  for (const c of filtered) {
    for (const id of c.equipmentIds) set.add(id)
  }
  return set
}

/** Название цепочки, в которой состоит техника (первая по имени); если ни в одной — null. */
export function getChainNameForEquipment(
  equipmentId: string,
  excludeChainId: string | null,
  chains?: MaintenanceChain[],
): string | null {
  const list = chains ?? getMaintenanceChains()
  const chain = list
    .filter(
      (c) => c.id !== excludeChainId && c.equipmentIds.includes(equipmentId),
    )
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  return chain ? chain.name : null
}

/**
 * Интервалы ТО (м/ч) из цепочки, к которой принадлежит техника.
 * Если техника в нескольких цепочках — интервалы первой по имени.
 * Если ни в одной — пустой массив (интервал задаётся вручную).
 */
export function getIntervalHoursForEquipment(
  equipmentId: string,
  chains?: MaintenanceChain[],
): number[] {
  if (!equipmentId.trim()) return []
  const list = chains ?? getMaintenanceChains()
  const chain = list
    .filter((c) => c.equipmentIds.includes(equipmentId))
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  return chain?.intervalHours ?? []
}

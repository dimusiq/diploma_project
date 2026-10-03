import { WAREHOUSE_DEPTH, WAREHOUSE_WIDTH } from "./simLayout.ts"

/** Небольшой внутренний отступ карты в пикселях экрана. */
export const WAREHOUSE_MAP_PADDING_PX = 20

export type WarehouseMapBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type FittedWarehouseViewport = {
  viewBox: string
  scale: number
  offsetX: number
  offsetY: number
  x: number
  y: number
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
}

/** Границы здания. Мировые координаты объектов не сдвигаются. */
export function warehouseContentBounds(): WarehouseMapBounds {
  return { x: 0, y: 0, width: WAREHOUSE_WIDTH, height: WAREHOUSE_DEPTH }
}

/**
 * Вписывает склад в контейнер с сохранением пропорций и центрированием.
 * viewBox совпадает с аспектом контейнера, поэтому meet не добавляет второе поле.
 */
export function fitWarehouseToViewport(
  containerWidth: number,
  containerHeight: number,
  bounds: WarehouseMapBounds = warehouseContentBounds(),
  padding = WAREHOUSE_MAP_PADDING_PX,
): FittedWarehouseViewport {
  const safeW = Math.max(containerWidth, 1)
  const safeH = Math.max(containerHeight, 1)
  const pad = Math.min(padding, safeW / 4, safeH / 4)
  const scaleX = (safeW - pad * 2) / bounds.width
  const scaleY = (safeH - pad * 2) / bounds.height
  const scale = Math.min(scaleX, scaleY)
  const viewW = safeW / scale
  const viewH = safeH / scale
  const x = bounds.x - (viewW - bounds.width) / 2
  const y = bounds.y - (viewH - bounds.height) / 2
  return {
    viewBox: `${x} ${y} ${viewW} ${viewH}`,
    scale,
    offsetX: (safeW - bounds.width * scale) / 2,
    offsetY: (safeH - bounds.height * scale) / 2,
    x,
    y,
    width: viewW,
    height: viewH,
    pixelWidth: safeW,
    pixelHeight: safeH,
  }
}

/**
 * Высота контейнера следует из ширины и пропорций склада,
 * чтобы боковые поля не раздувались сильнее заданного padding.
 */
/** Масштаб карты на контейнере 960 px. От него считается лёгкая реакция текста на zoom. */
export const MAP_LABEL_REFERENCE_SCALE =
  (960 - WAREHOUSE_MAP_PADDING_PX * 2) / WAREHOUSE_WIDTH

export type MapLabelRange = {
  target: number
  min: number
  max: number
}

/** Целевой размер в пикселях экрана. Геометрия склада не меняется. */
export const MAP_LABEL = {
  zone: { target: 18, min: 14, max: 18 },
  rack: { target: 13.5, min: 11, max: 14 },
  percent: { target: 13.5, min: 11, max: 14 },
  equipment: { target: 12.5, min: 10, max: 13 },
  equipmentSelected: { target: 14, min: 12, max: 14 },
  forklift: { target: 10.5, min: 10, max: 11 },
  gate: { target: 11.5, min: 10, max: 12 },
  secondary: { target: 10.5, min: 10, max: 11 },
} as const

/** Пиксели подписи с min/max. При увеличении карты текст растёт слабо, при уменьшении — сжимается. */
export function mapLabelPixels(
  range: MapLabelRange,
  scale: number,
  reference = MAP_LABEL_REFERENCE_SCALE,
): number {
  const zoom = Math.max(scale, 0.01) / Math.max(reference, 0.01)
  const response = zoom >= 1 ? zoom ** 0.2 : zoom ** 0.45
  return Math.min(range.max, Math.max(range.min, range.target * response))
}

/** Размер шрифта в единицах viewBox, чтобы на экране получились заданные пиксели. */
export function mapLabelFont(range: MapLabelRange, scale: number): number {
  return mapLabelPixels(range, scale) / Math.max(scale, 0.01)
}

/** Подпись техники чуть ниже корпуса. Соседи получают небольшой сдвиг, чтобы не слипаться. */
export function vehicleLabelShift(
  id: string,
  kind: string,
  nearbyIds: string[],
  font: number,
): { x: number; y: number } {
  const half = kind === "forklift" ? 0.9 : kind === "amr" ? 1.3 : 1.1
  const rank = nearbyIds.filter((other) => other < id).length
  const side = rank === 0 ? 0 : rank % 2 === 0 ? 1 : -1
  return {
    x: side * font * 0.9,
    y: half + font * 0.85 + rank * font * 1.15,
  }
}

export function fitWarehouseToWidth(
  containerWidth: number,
  bounds: WarehouseMapBounds = warehouseContentBounds(),
  padding = WAREHOUSE_MAP_PADDING_PX,
): FittedWarehouseViewport {
  const safeW = Math.max(containerWidth, 1)
  const height = safeW * (bounds.height / bounds.width)
  return fitWarehouseToViewport(safeW, height, bounds, padding)
}

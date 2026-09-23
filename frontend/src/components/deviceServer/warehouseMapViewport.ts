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
export function fitWarehouseToWidth(
  containerWidth: number,
  bounds: WarehouseMapBounds = warehouseContentBounds(),
  padding = WAREHOUSE_MAP_PADDING_PX,
): FittedWarehouseViewport {
  const safeW = Math.max(containerWidth, 1)
  const height = safeW * (bounds.height / bounds.width)
  return fitWarehouseToViewport(safeW, height, bounds, padding)
}

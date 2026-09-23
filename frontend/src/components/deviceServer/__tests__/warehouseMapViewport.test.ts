import { describe, expect, it } from "vitest"
import { WAREHOUSE_DEPTH, WAREHOUSE_WIDTH } from "../simLayout.ts"
import {
  fitWarehouseToViewport,
  fitWarehouseToWidth,
  warehouseContentBounds,
  WAREHOUSE_MAP_PADDING_PX,
} from "../warehouseMapViewport.ts"

describe("fitWarehouseToViewport", () => {
  const bounds = warehouseContentBounds()

  it("uses the real warehouse rectangle as the content bounds", () => {
    expect(bounds).toEqual({
      x: 0,
      y: 0,
      width: WAREHOUSE_WIDTH,
      height: WAREHOUSE_DEPTH,
    })
  })

  it("fits the warehouse with uniform padding when the container matches its aspect", () => {
    const width = 1040
    const height = width * (bounds.height / bounds.width)
    const fitted = fitWarehouseToViewport(width, height, bounds, 20)
    expect(fitted.scale).toBeCloseTo(
      Math.min((width - 40) / bounds.width, (height - 40) / bounds.height),
    )
    expect(fitted.offsetX).toBeGreaterThanOrEqual(20 - 0.01)
    expect(fitted.offsetY).toBeCloseTo(20, 1)
    expect(fitted.width / fitted.height).toBeCloseTo(width / height, 5)
    expect(fitted.x).toBeLessThan(bounds.x)
    expect(fitted.x + fitted.width).toBeGreaterThan(bounds.x + bounds.width)
    expect(fitted.y).toBeLessThan(bounds.y)
    expect(fitted.y + fitted.height).toBeGreaterThan(bounds.y + bounds.height)
  })

  it("keeps aspect and centers the warehouse in a wide container", () => {
    const fitted = fitWarehouseToViewport(1600, 500, bounds, 20)
    const scaleX = (1600 - 40) / bounds.width
    const scaleY = (500 - 40) / bounds.height
    expect(fitted.scale).toBeCloseTo(Math.min(scaleX, scaleY))
    expect(fitted.offsetY).toBeCloseTo(20, 1)
    expect(fitted.offsetX).toBeGreaterThan(20)
    const warehouseCenterX = bounds.x + bounds.width / 2
    expect(fitted.x + fitted.width / 2).toBeCloseTo(warehouseCenterX)
  })

  it("sizes the default view from the container width so the building fills the frame", () => {
    const fitted = fitWarehouseToWidth(960, bounds, WAREHOUSE_MAP_PADDING_PX)
    const occupied = (bounds.width * fitted.scale) / 960
    expect(occupied).toBeGreaterThan(0.85)
    expect(occupied).toBeLessThanOrEqual(1)
    expect(fitted.viewBox.startsWith("-26")).toBe(false)
  })
})

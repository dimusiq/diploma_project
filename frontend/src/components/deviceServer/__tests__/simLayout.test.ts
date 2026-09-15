import { describe, expect, it } from "vitest"
import { routeBetween } from "../simLayout.ts"

describe("маршрутизация по проездам", () => {
  it("строит путь между точками и заканчивает его в цели", () => {
    const path = routeBetween({ x: 6, z: 24 }, { x: 50, z: 41 })
    expect(path.length).toBeGreaterThan(1)
    const last = path[path.length - 1]
    expect(last).toEqual({ x: 50, z: 41 })
  })

  it("не возвращает пустой маршрут для совпадающих точек", () => {
    const path = routeBetween({ x: 10, z: 10 }, { x: 10, z: 10 })
    expect(path).toHaveLength(1)
  })
})

import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

/** Нормализованные координаты плана (0…1) → мир (пол в центре склада). */
export function normXZToWorldFloor(
  geom: WarehouseGeometry,
  xNorm: number,
  zNorm: number,
  y = 0.14,
): [number, number, number] {
  const x = (xNorm - 0.5) * geom.floorWidth
  const z = (zNorm - 0.5) * geom.floorDepth
  return [x, y, z]
}

/** Позиция узла графа: поддержка x_norm/z_norm или абсолютных x,z (метры). */
export function routeNodeToWorldFloor(
  geom: WarehouseGeometry,
  pos: Record<string, unknown>,
): [number, number, number] | null {
  const xn = pos.x_norm
  const zn = pos.z_norm
  if (typeof xn === "number" && typeof zn === "number") {
    return normXZToWorldFloor(geom, xn, zn)
  }
  const x = pos.x
  const z = pos.z
  if (typeof x === "number" && typeof z === "number") {
    const y = typeof pos.y === "number" ? pos.y : 0.14
    return [x, y, z]
  }
  return null
}

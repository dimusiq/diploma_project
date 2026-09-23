/**
 * Габариты техники, которую рисует сцена. Ширина — local X (поперёк проезда),
 * длина — local Z. Цифры сняты с мешей, не с размера корпуса.
 *
 * ForkliftBody (procedural): колёса x=±0.44, ось цилиндра вдоль X,
 * ступица 0.12 м → ширина 1.00 м. Радиус колеса не добавляет ширину.
 * DynamicFleet рисует twin ForkliftModel: корпус 1.05 м, колёса
 * x=±0.48 с толщиной 0.14 м → ширина 1.10 м, вилы до z=1.925 → длина 2.875 м.
 * AGV/AMR: основание 1.28 × 1.28 м. Это максимум.
 *
 * Проезд: две полные ширины и зазор до стеллажа с каждой стороны.
 * width/2 + width/2 — это одна машина, две корпуса так не встают.
 */
export const SAFETY_CLEARANCE = 0.45

export type VehiclePhysicalSize = {
  width: number
  length: number
  safetyMargin: number
}

export const VEHICLE_PHYSICAL_DIMENSIONS: Record<string, VehiclePhysicalSize> = {
  forklift: { width: 1.1, length: 2.875, safetyMargin: SAFETY_CLEARANCE },
  agv: { width: 1.28, length: 1.28, safetyMargin: SAFETY_CLEARANCE },
  amr: { width: 1.28, length: 1.28, safetyMargin: SAFETY_CLEARANCE },
  reach_truck: { width: 0.7, length: 1.46, safetyMargin: SAFETY_CLEARANCE },
  order_picker: { width: 0.7, length: 1.14, safetyMargin: SAFETY_CLEARANCE },
  pallet_jack: { width: 0.33, length: 1.2, safetyMargin: SAFETY_CLEARANCE },
  electric_pallet_jack: { width: 0.42, length: 1.28, safetyMargin: SAFETY_CLEARANCE },
}

export const MAX_VEHICLE_KIND = "agv"

export const MAX_VEHICLE_WIDTH = Math.max(
  ...Object.values(VEHICLE_PHYSICAL_DIMENSIONS).map((item) => item.width),
)

/** 2 × ширина + зазор слева + зазор справа. */
export const REQUIRED_AISLE_WIDTH =
  Math.round(
    (MAX_VEHICLE_WIDTH + MAX_VEHICLE_WIDTH + SAFETY_CLEARANCE + SAFETY_CLEARANCE) *
      100,
  ) / 100

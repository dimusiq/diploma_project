"""Физические габариты техники, которую рисует 3D-сцена.

Ширина — ось X модели (поперёк проезда, когда +Z смотрит вдоль движения).
Длина — ось Z модели. Кольцо выделения и маяки в габарит не входят.

Измерение по геометрии мешей, не по корпусу:

- procedural ForkliftBody: колёса в x=±0.44, ось цилиндра вдоль X
  (поворот Z на 90°), толщина ступицы 0.12 м. Радиус 0.14 м уходит
  в высоту и длину, не в ширину. Внешняя кромка x=±0.50, ширина 1.00 м,
  не 1.16 м.
- twin ForkliftModel (то, что рисует DynamicFleet): корпус 1.05 м,
  колёса x=±0.48, scale цилиндра [0.22, 0.14, 0.22] — толщина по X
  равна 0.14 м, внешняя кромка x=±0.55, ширина 1.10 м.
  Вилы до z=1.925, шасси до z=-0.95, длина 2.875 м.
- twin AGVModel / AMR: основание scale [1.28, 0.16, 1.28]. Колёса
  не выходят за корпус. Ширина и длина 1.28 м.
- reach truck, order picker, pallet jack, electric pallet jack —
  procedural-модели. Все уже AGV.

Максимум — AGV и AMR, 1.28 м. Один габарит на все mobile vehicles:
он не меньше forklift (1.10 м), поэтому разъезд, рассчитанный на AGV,
вмещает и погрузчик.
"""

from __future__ import annotations

SAFETY_CLEARANCE = 0.45

VEHICLE_PHYSICAL_DIMENSIONS: dict[str, dict[str, float]] = {
    "forklift": {"width": 1.10, "length": 2.875, "safetyMargin": SAFETY_CLEARANCE},
    "agv": {"width": 1.28, "length": 1.28, "safetyMargin": SAFETY_CLEARANCE},
    "amr": {"width": 1.28, "length": 1.28, "safetyMargin": SAFETY_CLEARANCE},
    "reach_truck": {"width": 0.70, "length": 1.46, "safetyMargin": SAFETY_CLEARANCE},
    "order_picker": {"width": 0.70, "length": 1.14, "safetyMargin": SAFETY_CLEARANCE},
    "pallet_jack": {"width": 0.33, "length": 1.20, "safetyMargin": SAFETY_CLEARANCE},
    "electric_pallet_jack": {"width": 0.42, "length": 1.28, "safetyMargin": SAFETY_CLEARANCE},
}

MAX_VEHICLE_KIND = "agv"
MAX_VEHICLE_WIDTH = max(item["width"] for item in VEHICLE_PHYSICAL_DIMENSIONS.values())
MAX_VEHICLE_LENGTH = max(item["length"] for item in VEHICLE_PHYSICAL_DIMENSIONS.values())

# Две одинаковые машины бок о бок. Каждая занимает свою полную ширину.
# clearanceLeft и clearanceRight — зазор до стеллажа.
# Запись width/2 + width/2 равна одной машине и две корпуса не вмещает.
REQUIRED_AISLE_WIDTH = round(
    MAX_VEHICLE_WIDTH + MAX_VEHICLE_WIDTH + SAFETY_CLEARANCE + SAFETY_CLEARANCE,
    2,
)

# Центры полос разъезда разведены на ширину машины. Радиус ожидания
# должен быть меньше этого расстояния, иначе легальный разъезд
# считается блокировкой. Встречные на одной оси по-прежнему ждут.
VEHICLE_BLOCK_RADIUS = round(MAX_VEHICLE_WIDTH / 2 + SAFETY_CLEARANCE / 2, 3)

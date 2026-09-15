"""
Warehouse Device Server — симулятор склада и генератор событий (admin-модуль).

Три источника правды:

1. Runtime — `WarehouseSimRuntime.world` в одном FastAPI-процессе
   (часы, техника, движение, transient telemetry, живой буфер событий).
2. `wsim_*` — конфигурация симуляции (layout, устройства, сценарии, журнал).
3. Существующий WMS — Item, InboundOrder, OutboundOrder, WarehouseTask,
   Shipment, InventoryLot. Интеграционный слой (`integration.py`) проецирует
   события симуляции на эти сущности и не создаёт параллельный домен.

Доступ: `is_superuser` или `user.role.name == ROLE_ADMIN`.
"""

from app.warehouse_sim import models as _models  # noqa: F401 — регистрация таблиц SQLModel

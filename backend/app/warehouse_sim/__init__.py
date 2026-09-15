"""
Warehouse Device Server — симулятор склада и генератор событий (admin-модуль).

Движок симуляции управляет техникой; интеграционный слой пишет в существующий
WMS-домен (Item, InboundOrder, OutboundOrder, WarehouseTask, Shipment).
"""

from app.warehouse_sim import models as _models  # noqa: F401 — регистрация таблиц SQLModel

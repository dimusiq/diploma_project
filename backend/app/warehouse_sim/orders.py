"""Заказы симулятора проецируются на InboundOrder / OutboundOrder."""

from app.warehouse_sim.simulation import spawn_inbound_truck, spawn_outbound_order

__all__ = ["spawn_inbound_truck", "spawn_outbound_order"]

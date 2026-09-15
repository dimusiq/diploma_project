"""Синхронизация остатков симулятора с существующей моделью Item."""

from app.warehouse_sim.integration import reset_demo_domain, seed_world_inventory

__all__ = ["reset_demo_domain", "seed_world_inventory"]

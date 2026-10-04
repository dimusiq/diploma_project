"""Реализации инструментов агента: только ORM/SQLModel, без raw SQL из LLM.

Реализация: agent_tools_common / agent_tools_read / agent_tools_act.
"""

from __future__ import annotations

from typing import Any

from app.services.agent_tools_act import (
    handle_acknowledge_alert,
    handle_create_cycle_count_task,
    handle_create_maintenance_request,
    handle_create_transfer_task,
    handle_enqueue_integration_inbox,
    handle_publish_layout_version,
    handle_reassign_pick_task,
    handle_rebuild_projection,
    handle_reindex_knowledge,
    handle_reserve_slot,
    handle_schedule_replenishment,
    handle_sync_external_system,
)
from app.services.agent_tools_common import (
    _act_gate,
    _default_warehouse_id,
    _item_scope,
    _json,
)
from app.services.agent_tools_read import (
    handle_find_item_by_sku,
    handle_get_equipment_status,
    handle_get_expiring_inventory,
    handle_get_inventory_summary,
    handle_get_item_location,
    handle_get_layout_topology,
    handle_get_maintenance_calendar_events,
    handle_get_open_tasks,
    handle_get_recent_events,
    handle_get_slot_state,
    handle_list_zone_congestion,
    handle_run_what_if_simulation,
    handle_search_items_in_warehouse,
    handle_search_sop_documents,
)

HANDLERS: dict[str, Any] = {
    "search_items_in_warehouse": handle_search_items_in_warehouse,
    "get_inventory_summary": handle_get_inventory_summary,
    "find_item_by_sku": handle_find_item_by_sku,
    "get_item_location": handle_get_item_location,
    "get_slot_state": handle_get_slot_state,
    "list_zone_congestion": handle_list_zone_congestion,
    "get_expiring_inventory": handle_get_expiring_inventory,
    "get_open_tasks": handle_get_open_tasks,
    "get_equipment_status": handle_get_equipment_status,
    "get_maintenance_calendar_events": handle_get_maintenance_calendar_events,
    "get_recent_events": handle_get_recent_events,
    "search_sop_documents": handle_search_sop_documents,
    "get_layout_topology": handle_get_layout_topology,
    "enqueue_integration_inbox": handle_enqueue_integration_inbox,
    "run_what_if_simulation": handle_run_what_if_simulation,
    "create_transfer_task": handle_create_transfer_task,
    "reserve_slot": handle_reserve_slot,
    "create_cycle_count_task": handle_create_cycle_count_task,
    "reassign_pick_task": handle_reassign_pick_task,
    "create_maintenance_request": handle_create_maintenance_request,
    "acknowledge_alert": handle_acknowledge_alert,
    "schedule_replenishment": handle_schedule_replenishment,
    "publish_layout_version": handle_publish_layout_version,
    "rebuild_projection": handle_rebuild_projection,
    "reindex_knowledge": handle_reindex_knowledge,
    "sync_external_system": handle_sync_external_system,
}

__all__ = [
    "HANDLERS",
    "_act_gate",
    "_default_warehouse_id",
    "_item_scope",
    "_json",
    "handle_acknowledge_alert",
    "handle_create_cycle_count_task",
    "handle_create_maintenance_request",
    "handle_create_transfer_task",
    "handle_enqueue_integration_inbox",
    "handle_find_item_by_sku",
    "handle_get_equipment_status",
    "handle_get_expiring_inventory",
    "handle_get_inventory_summary",
    "handle_get_item_location",
    "handle_get_layout_topology",
    "handle_get_maintenance_calendar_events",
    "handle_get_open_tasks",
    "handle_get_recent_events",
    "handle_get_slot_state",
    "handle_list_zone_congestion",
    "handle_publish_layout_version",
    "handle_reassign_pick_task",
    "handle_rebuild_projection",
    "handle_reindex_knowledge",
    "handle_reserve_slot",
    "handle_run_what_if_simulation",
    "handle_schedule_replenishment",
    "handle_search_items_in_warehouse",
    "handle_search_sop_documents",
    "handle_sync_external_system",
]

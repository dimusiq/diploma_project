"""Каталог типов доменных событий (контракты для outbox / проекций)."""

# --- Inventory ---
EVENT_INVENTORY_RECEIVED = "inventory.received"
EVENT_INVENTORY_PUTAWAY_PLANNED = "inventory.putaway_planned"
EVENT_INVENTORY_PUTAWAY_COMPLETED = "inventory.putaway_completed"
EVENT_INVENTORY_MOVED = "inventory.moved"
EVENT_INVENTORY_PICKED = "inventory.picked"
EVENT_INVENTORY_PACKED = "inventory.packed"
EVENT_INVENTORY_SHIPPED = "inventory.shipped"
EVENT_INVENTORY_COUNTED = "inventory.counted"
EVENT_INVENTORY_ADJUSTED = "inventory.adjusted"

# --- Slots ---
EVENT_SLOT_BLOCKED = "slot.blocked"
EVENT_SLOT_UNBLOCKED = "slot.unblocked"

# --- Equipment ---
EVENT_EQUIPMENT_POSITION_UPDATED = "equipment.position_updated"
EVENT_EQUIPMENT_BATTERY_UPDATED = "equipment.battery_updated"

# --- Tasks ---
EVENT_TASK_CREATED = "task.created"
EVENT_TASK_STARTED = "task.started"
EVENT_TASK_PAUSED = "task.paused"
EVENT_TASK_COMPLETED = "task.completed"
EVENT_TASK_FAILED = "task.failed"

# --- Alerts ---
EVENT_ALERT_RAISED = "alert.raised"
EVENT_ALERT_RESOLVED = "alert.resolved"

# --- Queues (очереди доков / отбора / пр.) ---
EVENT_QUEUE_DEPTH_UPDATED = "queue.depth_updated"

# --- Legacy item / aggregate (уже используются в API) ---
EVENT_ITEM_CREATED = "item.created"
EVENT_ITEM_UPDATED = "item.updated"
EVENT_ITEM_STORAGE_UPDATED = "item.storage_updated"
EVENT_ITEM_STATUS_CHANGED = "item.status_changed"
EVENT_ITEM_DELETED = "item.deleted"

VERSIONED_EVENT_TYPES = frozenset(
    {
        EVENT_INVENTORY_RECEIVED,
        EVENT_INVENTORY_PUTAWAY_PLANNED,
        EVENT_INVENTORY_PUTAWAY_COMPLETED,
        EVENT_INVENTORY_MOVED,
        EVENT_INVENTORY_PICKED,
        EVENT_INVENTORY_PACKED,
        EVENT_INVENTORY_SHIPPED,
        EVENT_INVENTORY_COUNTED,
        EVENT_INVENTORY_ADJUSTED,
        EVENT_SLOT_BLOCKED,
        EVENT_SLOT_UNBLOCKED,
        EVENT_EQUIPMENT_POSITION_UPDATED,
        EVENT_EQUIPMENT_BATTERY_UPDATED,
        EVENT_TASK_CREATED,
        EVENT_TASK_STARTED,
        EVENT_TASK_PAUSED,
        EVENT_TASK_COMPLETED,
        EVENT_TASK_FAILED,
        EVENT_ALERT_RAISED,
        EVENT_ALERT_RESOLVED,
        EVENT_QUEUE_DEPTH_UPDATED,
    }
)

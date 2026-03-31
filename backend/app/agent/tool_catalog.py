"""
Декларативный каталог инструментов агента: имя, версия, класс безопасности, права, схема OpenAI.

Экспорт в LLM фильтруется по пользователю (`tools_for_user`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.agent.tool_safety import ToolSafetyClass
from app.core.permissions import PERM_AGENT_USE, PERM_INTEGRATIONS_INBOX_WRITE


@dataclass(frozen=True)
class CatalogTool:
    name: str
    version: str
    safety: ToolSafetyClass
    permission_code: str
    description: str
    parameters: dict[str, Any]
    requires_audit_read: bool = False
    requires_inbox_write: bool = False
    requires_maintenance_schedule_view: bool = False
    superuser_only: bool = False

    def to_openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                },
            },
        }


def _catalog() -> list[CatalogTool]:
    return [
        CatalogTool(
            name="search_items_in_warehouse",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Поиск товаров по фрагменту SKU или названия (read-only, границы прав пользователя). "
                "В ответе count — только число строк (≤ limit), не полное число совпадений в БД."
            ),
            parameters={
                "sku_fragment": {"type": "string", "description": "Подстрока SKU"},
                "title_fragment": {"type": "string", "description": "Подстрока названия"},
                "limit": {"type": "integer", "description": "1–50, по умолчанию 15"},
            },
        ),
        CatalogTool(
            name="get_inventory_summary",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description="Сводка запасов: счётчики товаров, на складе, с ячейкой, занятые слоты (по правам пользователя).",
            parameters={},
        ),
        CatalogTool(
            name="find_item_by_sku",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Найти товары по точному или частичному совпадению SKU. "
                "count в ответе — только строки в списке (≤ limit), не «всего найдено»."
            ),
            parameters={
                "sku": {"type": "string", "description": "SKU или фрагмент"},
                "exact": {"type": "boolean", "description": "Точное совпадение, иначе ILIKE"},
                "limit": {"type": "integer", "description": "Макс. записей, по умолчанию 20"},
            },
        ),
        CatalogTool(
            name="get_item_location",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description="Позиция товара: ячейка, ряд, уровень; по item_id или sku.",
            parameters={
                "item_id": {"type": "string", "description": "UUID товара"},
                "sku": {"type": "string", "description": "SKU если id неизвестен"},
            },
        ),
        CatalogTool(
            name="get_slot_state",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Состояние ячейки по slot_key или список последних занятых слотов (без slot_key — выборка по limit, "
                "не все занятые ячейки склада)."
            ),
            parameters={
                "slot_key": {"type": "string", "description": "Ключ ячейки (если пусто — выборка)"},
                "limit": {"type": "integer", "description": "Лимит записей при отсутствии slot_key"},
            },
        ),
        CatalogTool(
            name="list_zone_congestion",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Псевдо-загрузка по зонам: top-N зон по числу товаров на складе (привязка ряд→зона активного layout); "
                "остальные зоны в ответ не попадают."
            ),
            parameters={"limit_rows": {"type": "integer", "description": "Макс. зон в ответе"}},
        ),
        CatalogTool(
            name="get_expiring_inventory",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Товары со сроком годности в горизонте дней. "
                "items_total_in_horizon — всего в окне; count/items_returned — только усечённый список (limit)."
            ),
            parameters={
                "days": {"type": "integer", "description": "Горизонт в днях, по умолчанию 30"},
                "limit": {"type": "integer", "description": "Макс. позиций"},
            },
        ),
        CatalogTool(
            name="get_open_tasks",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Открытые складские задания (warehouse_task не в финальном статусе). "
                "tasks_total_open_matching_filter — всего по фильтру; count — только строки в ответе (limit)."
            ),
            parameters={
                "limit": {"type": "integer", "description": "Макс. записей"},
                "status": {"type": "string", "description": "Фильтр по статусу, опционально"},
            },
        ),
        CatalogTool(
            name="get_equipment_status",
            version="2",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Техника: operational status в карточке (коды active/maintenance/decommissioned), "
                "зона, моточасы. В ответе: total_units; breakdown_status_counts_sum; "
                "breakdown_sum_matches_total_units (должно быть true); operational_status_breakdown_ru — "
                "численность по статусам; listed_units — длина списка equipment (≤ limit). "
                "Плановое ТО по моточасам — только get_maintenance_calendar_events."
            ),
            parameters={
                "limit": {
                    "type": "integer",
                    "description": "Макс. единиц в списке equipment, по умолчанию 100, макс. 300",
                },
                "current_status": {
                    "type": "string",
                    "description": "Фильтр по статусу эксплуатации; пусто — все статусы",
                },
            },
        ),
        CatalogTool(
            name="get_maintenance_calendar_events",
            version="2",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Плановое ТО по моточасам: overdue (просрочка), due_soon (скоро), ok (в норме). "
                "Отдельно от operational status в карточке техники. "
                "events_total_matching_filter — сколько единиц попало под фильтр; count/events_returned — строк в массиве (≤ limit)."
            ),
            parameters={
                "status": {
                    "type": "string",
                    "description": "Фильтр: overdue | due_soon | ok; пусто — все три статуса",
                },
                "limit": {"type": "integer", "description": "Макс. записей, по умолчанию 50"},
            },
        ),
        CatalogTool(
            name="get_recent_events",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Последние доменные события (требуется право просмотра аудита); count — только последние limit записей, не весь журнал."
            ),
            parameters={
                "limit": {"type": "integer", "description": "Макс. событий"},
                "event_type_prefix": {"type": "string", "description": "Фильтр по префиксу типа"},
            },
            requires_audit_read=True,
        ),
        CatalogTool(
            name="search_sop_documents",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description=(
                "Поиск по базе знаний ассистента (SOP, регламенты) по ключевым словам; "
                "count — число фрагментов в ответе, не размер всей базы."
            ),
            parameters={
                "query": {"type": "string", "description": "Поисковая строка"},
                "limit": {"type": "integer", "description": "Макс. фрагментов"},
            },
        ),
        CatalogTool(
            name="get_layout_topology",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description="Текущая топология активного layout (зоны, проходы, доки) в JSON.",
            parameters={},
        ),
        CatalogTool(
            name="enqueue_integration_inbox",
            version="1",
            safety=ToolSafetyClass.PROPOSE,
            permission_code=PERM_INTEGRATIONS_INBOX_WRITE,
            description=(
                "Записать событие во входящую очередь интеграций (реальный коннектор к WMS/ERP/PLC): "
                "данные попадут в integration_inbox для последующей обработки воркером."
            ),
            parameters={
                "source": {
                    "type": "string",
                    "description": "Источник: wms, erp, plc, tms, custom",
                },
                "event_type": {"type": "string", "description": "Тип события во внешней системе"},
                "payload": {
                    "type": "object",
                    "description": "Тело события (JSON)",
                },
            },
            requires_inbox_write=True,
        ),
        CatalogTool(
            name="run_what_if_simulation",
            version="1",
            safety=ToolSafetyClass.READ,
            permission_code=PERM_AGENT_USE,
            description="Запуск дискретно-событийной симуляции «что если» (только расчёт KPI, без изменения БД).",
            parameters={
                "duration_hours": {"type": "number", "description": "Длительность сценария в часах"},
                "dock_bays": {"type": "integer"},
                "num_forklifts": {"type": "integer"},
                "num_operators": {"type": "integer"},
                "putaway_rule": {
                    "type": "string",
                    "description": "nearest | round_robin | random",
                },
                "layout_travel_scale": {"type": "number"},
            },
        ),
        # --- propose / act: в чате по умолчанию только предложение или sandbox ---
        CatalogTool(
            name="create_transfer_task",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description=(
                "Создать задание на перемещение (act). Без подтверждения в API и прав суперпользователя "
                "не выполняется; в sandbox возвращается только план."
            ),
            parameters={
                "task_type": {"type": "string", "description": "move|putaway|pick|…"},
                "note": {"type": "string", "description": "Комментарий / детали для оператора"},
                "priority": {"type": "integer"},
            },
        ),
        CatalogTool(
            name="reserve_slot",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Зарезервировать ячейку (act; требует подтверждения, пока не реализовано в БД — dry-run).",
            parameters={
                "slot_key": {"type": "string"},
                "reason": {"type": "string"},
            },
        ),
        CatalogTool(
            name="create_cycle_count_task",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Создать задание инвентаризации (cycle count).",
            parameters={"scope": {"type": "string", "description": "row|zone|sku"}, "hint": {"type": "string"}},
        ),
        CatalogTool(
            name="reassign_pick_task",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Переназначить отбор на другого исполнителя.",
            parameters={
                "task_id": {"type": "string"},
                "assignee_user_id": {"type": "string"},
            },
        ),
        CatalogTool(
            name="create_maintenance_request",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Заявка на обслуживание техники.",
            parameters={
                "equipment_id": {"type": "string"},
                "description": {"type": "string"},
            },
        ),
        CatalogTool(
            name="acknowledge_alert",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Подтвердить прочтение уведомления пользователя.",
            parameters={"notification_id": {"type": "string"}},
        ),
        CatalogTool(
            name="schedule_replenishment",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Запланировать пополнение (логическая операция; в БД — заглушка).",
            parameters={"sku": {"type": "string"}, "quantity": {"type": "integer"}},
        ),
        CatalogTool(
            name="publish_layout_version",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Опубликовать ревизию layout (только суперпользователь; иначе отказ).",
            parameters={"layout_id": {"type": "string"}},
            superuser_only=True,
        ),
        CatalogTool(
            name="rebuild_projection",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Пересборка проекций (опасно; только суперпользователь).",
            parameters={"consumer": {"type": "string", "description": "имя consumer или all"}},
            superuser_only=True,
        ),
        CatalogTool(
            name="reindex_knowledge",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description="Переиндексация базы знаний ассистента.",
            parameters={"chunk_id": {"type": "string", "description": "опционально один chunk"}},
            superuser_only=True,
        ),
        CatalogTool(
            name="sync_external_system",
            version="1",
            safety=ToolSafetyClass.ACT,
            permission_code=PERM_AGENT_USE,
            description=(
                "Устаревшая заглушка; для реальной доставки во внешний контур используйте "
                "enqueue_integration_inbox."
            ),
            parameters={"system": {"type": "string"}, "entity": {"type": "string"}},
            superuser_only=True,
        ),
    ]


CATALOG: list[CatalogTool] = _catalog()
CATALOG_BY_NAME: dict[str, CatalogTool] = {t.name: t for t in CATALOG}


def tools_for_user(
    *,
    is_superuser: bool,
    has_audit_read: bool,
    has_inbox_write: bool = False,
    has_maintenance_schedule_view: bool = False,
) -> list[CatalogTool]:
    out: list[CatalogTool] = []
    for t in CATALOG:
        if t.superuser_only and not is_superuser:
            continue
        if t.requires_audit_read and not has_audit_read:
            continue
        if t.requires_inbox_write and not has_inbox_write:
            continue
        if t.requires_maintenance_schedule_view and not has_maintenance_schedule_view:
            continue
        out.append(t)
    return out


def openai_tools_for_user(
    *,
    is_superuser: bool,
    has_audit_read: bool,
    has_inbox_write: bool = False,
    has_maintenance_schedule_view: bool = False,
) -> list[dict[str, Any]]:
    return [
        x.to_openai_tool()
        for x in tools_for_user(
            is_superuser=is_superuser,
            has_audit_read=has_audit_read,
            has_inbox_write=has_inbox_write,
            has_maintenance_schedule_view=has_maintenance_schedule_view,
        )
    ]

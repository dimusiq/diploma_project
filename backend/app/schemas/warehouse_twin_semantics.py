"""
Семантический слой цифрового двойника склада: типы сущностей, процессов и привязка к таблицам БД.

Используется API `/warehouse/twin/semantic-overview` и документирует единый словарь для интеграций WMS/ERP/PLC.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models import TwinBusinessRulePublic, TwinSlaDefinitionPublic

TwinEntityKind = Literal[
    "warehouse",
    "zone",
    "aisle",
    "storage_cell",
    "dock",
    "staging_area",
    "equipment",
    "warehouse_task",
    "sku",
    "handling_unit",
    "route_graph",
    "domain_event",
    "slot_occupancy_state",
    "sla_definition",
    "kpi_snapshot",
    "constraint_rule",
    "business_rule",
]

TwinProcessKind = Literal[
    "inbound",
    "putaway",
    "storage",
    "pick",
    "pack",
    "ship",
    "replenish",
    "count",
    "internal_move",
    "cross_dock",
    "maintenance",
    "other",
]


class TwinEntityDescriptor(BaseModel):
    """Описание доменной сущности и где она материализована в системе."""

    kind: TwinEntityKind
    title: str = Field(description="Человекочитаемое имя")
    sql_table: str | None = Field(
        default=None,
        description="Основная таблица SQLModel, если есть",
    )
    api_surface: str | None = Field(
        default=None,
        description="Ключевые HTTP-префиксы или модули API",
    )
    notes: str | None = None


class TwinSemanticsVocabulary(BaseModel):
    """Статический справочник сущностей и процессов (онтология-подобный контракт)."""

    entities: list[TwinEntityDescriptor]
    process_kinds: list[TwinProcessKind]


class TwinSemanticOverviewResponse(BaseModel):
    """Единый снимок: словарь сущностей + активные SLA и правила из БД."""

    vocabulary: TwinSemanticsVocabulary
    sla_definitions: list[TwinSlaDefinitionPublic]
    business_rules: list[TwinBusinessRulePublic]


def build_default_vocabulary() -> TwinSemanticsVocabulary:
    return TwinSemanticsVocabulary(
        entities=[
            TwinEntityDescriptor(
                kind="warehouse",
                title="Склад",
                sql_table="warehouse",
                api_surface="/api/v1/warehouse/layout, /warehouse/twin",
            ),
            TwinEntityDescriptor(
                kind="zone",
                title="Зона",
                sql_table="warehousezone",
                api_surface="/api/v1/zones",
            ),
            TwinEntityDescriptor(
                kind="aisle",
                title="Проход",
                sql_table="warehouse_aisle",
                api_surface="/api/v1/warehouse/topology",
            ),
            TwinEntityDescriptor(
                kind="storage_cell",
                title="Ячейка / bin",
                sql_table="storage_bin",
                api_surface="/api/v1/warehouse/topology, Item.storage_*",
                notes="Согласована с координатами Item (row, level, cell_x, cell_z).",
            ),
            TwinEntityDescriptor(
                kind="dock",
                title="Док / ворота",
                sql_table="dock_door",
                api_surface="/api/v1/warehouse/topology",
            ),
            TwinEntityDescriptor(
                kind="staging_area",
                title="Стадийная / буферная зона",
                sql_table="staging_area",
                api_surface="/api/v1/warehouse/topology",
            ),
            TwinEntityDescriptor(
                kind="equipment",
                title="Техника",
                sql_table="equipment",
                api_surface="/api/v1/equipment",
            ),
            TwinEntityDescriptor(
                kind="warehouse_task",
                title="Складское задание",
                sql_table="warehouse_task",
                api_surface="/api/v1/warehouse/tasks",
            ),
            TwinEntityDescriptor(
                kind="sku",
                title="SKU / номенклатура",
                sql_table="item",
                api_surface="/api/v1/items",
                notes="Поле sku на Item; партии — inventory_lot.",
            ),
            TwinEntityDescriptor(
                kind="handling_unit",
                title="Handling unit",
                sql_table="handling_unit",
                api_surface="/api/v1/warehouse/topology (связанные сущности)",
            ),
            TwinEntityDescriptor(
                kind="route_graph",
                title="Маршрут (узлы и рёбра)",
                sql_table="route_node, route_edge",
                api_surface="/api/v1/warehouse/topology",
            ),
            TwinEntityDescriptor(
                kind="domain_event",
                title="Доменное событие",
                sql_table="domain_event",
                api_surface="/api/v1/domain-events",
            ),
            TwinEntityDescriptor(
                kind="slot_occupancy_state",
                title="Состояние занятости ячеек (проекция)",
                sql_table="warehouse_slot_occupancy",
                api_surface="/api/v1/warehouse/layout/occupancy",
            ),
            TwinEntityDescriptor(
                kind="sla_definition",
                title="Определение SLA",
                sql_table="twin_sla_definition",
                api_surface="/api/v1/warehouse/twin/sla-definitions",
            ),
            TwinEntityDescriptor(
                kind="kpi_snapshot",
                title="Снимок KPI",
                sql_table="—",
                api_surface="/api/v1/warehouse/twin/summary, simulation/kpi_snapshot",
                notes="Агрегаты из БД и DES-симуляции.",
            ),
            TwinEntityDescriptor(
                kind="constraint_rule",
                title="Ограничение (constraint)",
                sql_table="twin_business_rule",
                api_surface="/api/v1/warehouse/twin/business-rules",
                notes="rule_kind=constraint в twin_business_rule.",
            ),
            TwinEntityDescriptor(
                kind="business_rule",
                title="Правило (validation / routing_hint / …)",
                sql_table="twin_business_rule",
                api_surface="/api/v1/warehouse/twin/business-rules",
            ),
        ],
        process_kinds=[
            "inbound",
            "putaway",
            "storage",
            "pick",
            "pack",
            "ship",
            "replenish",
            "count",
            "internal_move",
            "cross_dock",
            "maintenance",
            "other",
        ],
    )

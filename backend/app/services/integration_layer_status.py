"""
Сводка возможностей Event & Integration Layer для API (/integrations/layer-status).

Отражает фактическое состояние кода, а не маркетинг: что уже есть vs заглушки.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.agent.llm_adapter import llm_inference_configured
from app.core.config import Settings
from app.projections.consumers import CONSUMER_HANDLERS


class AdapterSurface(BaseModel):
    """Поверхность интеграции: куда система может принимать или отдавать данные."""

    id: str
    category: Literal[
        "wms",
        "erp",
        "tms",
        "plc_scada",
        "iot",
        "telemetry_rtls",
        "identification",
        "custom",
    ]
    title: str
    implementation: Literal["planned", "partial", "active"]
    ingest_paths: list[str] = Field(default_factory=list)
    notes: str | None = None


class MessageBusSurface(BaseModel):
    """Внешний брокер сообщений (целевая архитектура vs текущая реализация)."""

    pattern: Literal[
        "none",
        "redis_auxiliary",
        "postgres_outbox",
        "hybrid_postgres_redis",
    ]
    redis_url_configured: bool
    redis_usage: list[str] = Field(
        default_factory=list,
        description="Фактическое использование Redis в приложении",
    )
    planned_brokers: list[str] = Field(
        default_factory=lambda: ["kafka", "nats", "rabbitmq", "redis_streams"],
        description="Не подключены; ориентир для эволюции",
    )


class OutboxReplaySurface(BaseModel):
    """Transactional outbox доменных событий и восстановление проекций."""

    transactional_outbox_table: bool = True
    outbox_dispatcher: Literal["worker_loop", "inline"] = "worker_loop"
    consumer_names: list[str] = Field(default_factory=list)
    idempotency: str = "projection_consumer_processed (consumer, domain_event_id)"
    replay_http_path: str = "/api/v1/projections/replay"
    notes: str | None = None


class IntegrationInboxSurface(BaseModel):
    """Входящая очередь произвольных событий коннекторов."""

    table: bool = True
    http_ingest_path: str = "/api/v1/integrations/inbox"
    twin_external_fact_path: str = "/api/v1/warehouse/twin/external-fact"
    agent_tool_enqueue: str = "enqueue_integration_inbox"
    downstream_processing: Literal[
        "domain_pipeline_outbox_projections",
        "twin_telemetry_pulse_only",
        "full_etl",
    ] = "domain_pipeline_outbox_projections"
    notes: str | None = (
        "Воркер: integration_inbox → доменные мутации + domain_event + outbox → проекции "
        "(twin_timeline, slot_occupancy_sync, twin_task_state, twin_equipment_pose, "
        "twin_queue_depth, twin_alert_open); SSE с domain_event_id; idempotency_key (source, key)."
    )


class TwinRealtimeSurface(BaseModel):
    """Клиентский realtime (не замена брокеру)."""

    sse_paths: list[str] = Field(
        default_factory=lambda: [
            "/api/v1/twin/stream",
            "/api/v1/warehouse/live/stream",
        ]
    )
    websocket_path: str = "/api/v1/twin/ws"
    replay: str = "in-memory ring buffer per process + optional seconds replay on connect"


class TwinStateOperationalDb(BaseModel):
    """Слой 1: операционная СУБД."""

    engine: Literal["postgresql"] = "postgresql"
    scope: str = "Мастер-данные, транзакции WMS/twin, техника, layout, политики"
    notable_tables: list[str] = Field(
        default_factory=lambda: [
            "warehouse",
            "item",
            "warehouse_task",
            "storage_bin",
            "handling_unit",
            "warehouse_layout",
            "equipment",
            "domain_event",
            "event_outbox",
        ]
    )


class TwinStateEventStore(BaseModel):
    """Слой 2: журнал доменных фактов (event sourcing light)."""

    primary_table: str = "domain_event"
    ordering: str = "event_seq (PostgreSQL sequence)"
    payload: str = "JSONB + payload_schema_version"
    coupled_outbox: bool = True
    http_read: str = "/api/v1/domain-events"


class TwinStateProjectionStore(BaseModel):
    """Слой 3: денормализованные read-модели для UI и twin."""

    tables: list[str] = Field(
        default_factory=lambda: [
            "warehouse_slot_occupancy",
            "twin_projection_entry",
            "twin_task_state_projection",
            "twin_equipment_pose_projection",
            "twin_queue_depth_projection",
            "twin_alert_open_projection",
        ]
    )
    refresh: str = "outbox → CONSUMER_HANDLERS; slot occupancy — отдельный reconcile"
    twin_dashboard_apis: list[str] = Field(
        default_factory=lambda: [
            "/api/v1/warehouse/twin/summary",
            "/api/v1/warehouse/layout/occupancy",
            "/api/v1/projections/feed",
        ]
    )


class TwinStateTimeSeries(BaseModel):
    """Слой 4: история телеметрии и KPI (целевой TSDB vs текущее)."""

    dedicated_tsdb: Literal["none"] = "none"
    planned_options: list[str] = Field(
        default_factory=lambda: ["timescaledb", "clickhouse", "influxdb"]
    )
    telemetry_in_postgres: list[str] = Field(
        default_factory=lambda: [
            "sensor_reading",
            "vehicle_position",
        ]
    )
    kpi_trends: str = (
        "Срезы по domain_event и сводки в коде (warehouse_twin_metrics); "
        "симуляции — simulation_scenario / DES, без отдельного KPI TSDB"
    )


class TwinStateVectorStore(BaseModel):
    """Слой 5: векторный поиск (RAG)."""

    engine: str = "pgvector (расширение PostgreSQL)"
    table: str = "agent_knowledge_chunk"
    vector_column: str = "embedding_vec"
    index: str = "HNSW (vector_cosine_ops)"
    scope: str = "Локальный RAG ассистента; не индекс всего склада"


class TwinStateLayerSurface(BaseModel):
    """Как устроено хранение состояния цифрового двойника и смежных данных."""

    operational_db: TwinStateOperationalDb
    event_store: TwinStateEventStore
    projection_store: TwinStateProjectionStore
    time_series: TwinStateTimeSeries
    vector_store: TwinStateVectorStore


class IntelligenceCapability(BaseModel):
    """Одна строка матрицы «оптимизация / аналитика»."""

    implementation: Literal["none", "partial", "simulation", "active"]
    notes: str


class IntelligenceReasoningRuntime(BaseModel):
    """LLM-слой рассуждений (локальный inference)."""

    api_style: str = "OpenAI-compatible HTTP (один base URL)"
    primary_target: str = "vLLM (OpenAI-совместимый HTTP API)"
    also_compatible: list[str] = Field(
        default_factory=lambda: [
            "другие OpenAI-compatible серверы через VLLM_BASE_URL / LLM_OPENAI_BASE_URL",
            "Ollama как совместимый backend (OLLAMA_BASE_URL), эмбеддинги LLM_EMBEDDING_API_STYLE=ollama",
        ]
    )
    env_keys: list[str] = Field(
        default_factory=lambda: [
            "VLLM_BASE_URL",
            "LLM_OPENAI_BASE_URL",
            "OLLAMA_BASE_URL",
            "VLLM_CHAT_MODEL",
            "LLM_CHAT_MODEL",
            "OLLAMA_MODEL",
            "VLLM_EMBED_MODEL",
            "LLM_EMBED_MODEL",
            "OLLAMA_EMBED_MODEL",
            "LLM_EMBEDDINGS_BASE_URL",
            "LLM_EMBEDDING_API_STYLE",
            "OLLAMA_MODEL_REASONING",
            "OLLAMA_MODEL_ROUTER",
        ]
    )
    llm_inference_configured: bool = False
    optional_post_tool_verify: str = "AGENT_VERIFY_LLM_PASS"
    agent_chat_path: str = "/api/v1/agent/chat"


class IntelligenceToolRuntime(BaseModel):
    """Вызов инструментов агента: права, политика, песочница, след."""

    catalog: str = "tool_catalog → openai_tools_for_user"
    invoke_path: str = "tool_registry.invoke_tool → run_agent_tool"
    rbac: str = "permission_code на инструмент; audit read / inbox write где нужно"
    policy: str = "AgentPolicy code=tool_execution (deny_tools, allow_act_tools, …)"
    sandbox_flag: str = "AGENT_SANDBOX_MODE; act без подтверждения блокируется"
    audit_log: str = "JSON в логгер app.agent.tools (run_id, actor, preview in/out)"
    approval_queue: str = "agent_pending_action; исполнение act — суперпользователь, sandbox off"


class IntelligenceRagMemory(BaseModel):
    """RAG и оперативная память диалога / сессии."""

    knowledge_chunks: str = "agent_knowledge_chunk; API /agent/knowledge; эмбеддинги vLLM/OpenAI API + pgvector"
    warehouse_context: str = "build_warehouse_context_for_user в контекст чата"
    operation_session: str = "AgentOperationSession.memory → operation_memory_block"
    dialog_summary: str = "history_summary (клиент/сервер); персист agent_chat_log"
    embed_env: str = "VLLM_EMBED_MODEL / LLM_EMBED_MODEL / OLLAMA_EMBED_MODEL; пусто — только keyword-RAG"


class IntelligenceOptimizationAnalytics(BaseModel):
    """Сервисы оптимизации и продвинутой аналитики (целевой контур vs код)."""

    route_optimization: IntelligenceCapability
    slotting_optimization: IntelligenceCapability
    replenishment_forecasting: IntelligenceCapability
    labor_planning: IntelligenceCapability
    anomaly_detection: IntelligenceCapability


class IntelligenceLayerSurface(BaseModel):
    """Intelligence Layer: LLM, инструменты, память, оптимизация."""

    reasoning_llm: IntelligenceReasoningRuntime
    tool_runtime: IntelligenceToolRuntime
    rag_memory: IntelligenceRagMemory
    optimization_analytics: IntelligenceOptimizationAnalytics


class GovernanceFacet(BaseModel):
    """Одна грань Observability & Governance (факт vs целевая зрелость)."""

    status: Literal["none", "partial", "active"]
    notes: str


class ObservabilityGovernanceLayerSurface(BaseModel):
    """Наблюдаемость, политики, контроль доступа, аудит, человек в контуре."""

    tracing: GovernanceFacet
    structured_logs: GovernanceFacet
    metrics: GovernanceFacet
    model_version_registry: GovernanceFacet
    policy_registry: GovernanceFacet
    rbac_abac: GovernanceFacet
    audit_trail: GovernanceFacet
    human_approval_workflow: GovernanceFacet


class IntegrationLayerStatusResponse(BaseModel):
    adapters: list[AdapterSurface]
    message_bus: MessageBusSurface
    domain_outbox: OutboxReplaySurface
    integration_inbox: IntegrationInboxSurface
    twin_realtime: TwinRealtimeSurface
    twin_state_layer: TwinStateLayerSurface
    intelligence_layer: IntelligenceLayerSurface
    observability_governance_layer: ObservabilityGovernanceLayerSurface
    version: str = "1"


def build_integration_layer_status(settings: Settings) -> IntegrationLayerStatusResponse:
    redis_on = bool(settings.REDIS_URL and str(settings.REDIS_URL).strip())
    redis_usage: list[str] = []
    if redis_on:
        redis_usage.extend(
            [
                "report_scheduler_distributed_lock",
                "agent_chat_rate_limit_optional",
            ]
        )

    bus_pattern: Literal["none", "redis_auxiliary", "postgres_outbox", "hybrid_postgres_redis"]
    if redis_on:
        bus_pattern = "hybrid_postgres_redis"
    else:
        bus_pattern = "postgres_outbox"

    adapters: list[AdapterSurface] = [
        AdapterSurface(
            id="http-wms-erp-tms",
            category="wms",
            title="Унифицированный HTTP-приём фактов (WMS/ERP/TMS-подобные системы)",
            implementation="partial",
            ingest_paths=[
                "/api/v1/integrations/inbox",
                "/api/v1/warehouse/twin/external-fact",
            ],
            notes="Нет отдельных протокольных адаптеров; контракт JSON + права.",
        ),
        AdapterSurface(
            id="agent-enqueue",
            category="custom",
            title="Запись во inbox через инструмент агента",
            implementation="partial",
            ingest_paths=[],
            notes="enqueue_integration_inbox → integration_inbox",
        ),
        AdapterSurface(
            id="telemetry-sensors-vehicles",
            category="telemetry_rtls",
            title="Телеметрия датчиков и позиций ТС",
            implementation="partial",
            ingest_paths=[
                "/api/v1/warehouse/equipment/telemetry/readings",
                "/api/v1/warehouse/equipment/telemetry/vehicle-positions",
            ],
            notes="Публикация в twin telemetry; не полноценный RTLS-адаптер.",
        ),
        AdapterSurface(
            id="plc-scada",
            category="plc_scada",
            title="PLC/SCADA",
            implementation="planned",
            notes="Ожидается мост к брокеру или OPC-UA → external-fact / inbox",
        ),
        AdapterSurface(
            id="iot-generic",
            category="iot",
            title="IoT-потоки",
            implementation="planned",
            notes="Тот же контур: брокер → адаптер → inbox или twin",
        ),
        AdapterSurface(
            id="barcode-rfid",
            category="identification",
            title="Штрихкод / RFID",
            implementation="partial",
            ingest_paths=[],
            notes="SKU/штрихкод на сущности Item; нет отдельного RFID edge-сервиса",
        ),
        AdapterSurface(
            id="erp-connector-stub",
            category="erp",
            title="Коннектор ERP (каталог UI)",
            implementation="planned",
        ),
        AdapterSurface(
            id="tms-connector-stub",
            category="tms",
            title="Коннектор TMS (каталог UI)",
            implementation="planned",
        ),
    ]

    twin_state = TwinStateLayerSurface(
        operational_db=TwinStateOperationalDb(),
        event_store=TwinStateEventStore(),
        projection_store=TwinStateProjectionStore(),
        time_series=TwinStateTimeSeries(),
        vector_store=TwinStateVectorStore(),
    )

    intelligence = IntelligenceLayerSurface(
        reasoning_llm=IntelligenceReasoningRuntime(
            llm_inference_configured=llm_inference_configured(),
        ),
        tool_runtime=IntelligenceToolRuntime(),
        rag_memory=IntelligenceRagMemory(),
        optimization_analytics=IntelligenceOptimizationAnalytics(
            route_optimization=IntelligenceCapability(
                implementation="simulation",
                notes=(
                    "DES: mean_pick_path_proxy_min как прокси длительности отбора; "
                    "нет TSP/VRP/реального графа проездов"
                ),
            ),
            slotting_optimization=IntelligenceCapability(
                implementation="none",
                notes="Нет оптимизатора размещения SKU по ячейкам (только правила putaway в симуляции)",
            ),
            replenishment_forecasting=IntelligenceCapability(
                implementation="partial",
                notes=(
                    "Стохастика replenishment в DES; инструмент schedule_replenishment — act/заглушка; "
                    "нет прогноза спроса / ML"
                ),
            ),
            labor_planning=IntelligenceCapability(
                implementation="simulation",
                notes=(
                    "DES: число операторов/погрузчиков, utilization; не смены и не планирование смен"
                ),
            ),
            anomaly_detection=IntelligenceCapability(
                implementation="partial",
                notes=(
                    "Пороговые уведомления twin (utilization, очереди); нет отдельного ML-детектора"
                ),
            ),
        ),
    )

    sentry_tracing_on = bool(
        settings.SENTRY_DSN
        and str(settings.SENTRY_DSN).strip()
        and getattr(settings, "ENVIRONMENT", "local") != "local"
    )
    tracing_notes = (
        "Распределённых trace_id (OpenTelemetry) нет. На один запрос чата: AgentTrace "
        "(фазы observe/tool/…) и JSON в лог app.agent.audit. "
        + (
            "Sentry SDK: enable_tracing при ненулевом SENTRY_DSN вне local."
            if sentry_tracing_on
            else "Sentry tracing обычно выключен (нет DSN или ENVIRONMENT=local)."
        )
    )

    observability_governance = ObservabilityGovernanceLayerSurface(
        tracing=GovernanceFacet(status="partial", notes=tracing_notes),
        structured_logs=GovernanceFacet(
            status="partial",
            notes=(
                "JSON-строки в логгерах app.agent.tools и app.agent.audit; "
                "нет единого JSON-access-log middleware / корреляции request_id по всему API"
            ),
        ),
        metrics=GovernanceFacet(
            status="partial",
            notes=(
                "Нет Prometheus /metrics. KPI двойника и сводки — в коде и HTTP (warehouse_twin_metrics); "
                "не системные RED/USE метрики сервиса"
            ),
        ),
        model_version_registry=GovernanceFacet(
            status="partial",
            notes=(
                "Версии инструментов: GET /api/v1/agent/tools (поле version). "
                "Имя модели на запуск: agent_run.model + env VLLM_CHAT_MODEL / LLM_CHAT_MODEL / OLLAMA_MODEL*. "
                "Нет центрального реестра артефактов (MLflow/W&B)"
            ),
        ),
        policy_registry=GovernanceFacet(
            status="active",
            notes=(
                "Таблица agent_policy; GET/PUT /api/v1/agent/policies; "
                "исполнение tool_execution в agent_policy_engine"
            ),
        ),
        rbac_abac=GovernanceFacet(
            status="partial",
            notes=(
                "RBAC: role → role_permission → permission.code; "
                "require_permission на маршрутах; суперпользователь — полный доступ. "
                "ABAC (атрибуты ресурса/контекста) не реализован"
            ),
        ),
        audit_trail=GovernanceFacet(
            status="partial",
            notes=(
                "Таблица audit_log, GET /api/v1/audit, log_audit на части критичных операций. "
                "Вызовы инструментов агента — в лог-файл, не в audit_log. "
                "Сохранённые шаги запуска: agent_run"
            ),
        ),
        human_approval_workflow=GovernanceFacet(
            status="partial",
            notes=(
                "agent_pending_action: ручная постановка и auto при requires_confirmation; "
                "исполнение act — суперпользователь и AGENT_SANDBOX_MODE=false. "
                "Нет полноценного BPM/многошагового согласования"
            ),
        ),
    )

    return IntegrationLayerStatusResponse(
        adapters=adapters,
        message_bus=MessageBusSurface(
            pattern=bus_pattern,
            redis_url_configured=redis_on,
            redis_usage=redis_usage,
        ),
        domain_outbox=OutboxReplaySurface(
            consumer_names=sorted(CONSUMER_HANDLERS.keys()),
            notes="Полный сброс проекций и повторная выгрузка — см. POST projections/replay (суперпользователь).",
        ),
        integration_inbox=IntegrationInboxSurface(),
        twin_realtime=TwinRealtimeSurface(),
        twin_state_layer=twin_state,
        intelligence_layer=intelligence,
        observability_governance_layer=observability_governance,
    )

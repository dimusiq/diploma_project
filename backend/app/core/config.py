import secrets
import warnings
from typing import Annotated, Any, Literal

from pydantic import (
    AliasChoices,
    AnyUrl,
    BeforeValidator,
    EmailStr,
    Field,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use top level .env file (one level above ./backend/)
        env_file="../.env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return MultiHostUrl.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: EmailStr | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    EMAIL_TEST_USER: EmailStr = "test@example.com"
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str

    # Redis: очереди / блокировки / кэш (этап digital twin). Пусто — без Redis.
    REDIS_URL: str | None = None
    # Если False — планировщик email-отчётов не стартует в API (запускайте `python -m app.worker`).
    RUN_REPORT_SCHEDULER_IN_API: bool = True

    # Базовый URL inference (приоритет сверху вниз в resolve_llm_chat_base_url).
    VLLM_BASE_URL: str | None = None
    LLM_OPENAI_BASE_URL: str | None = None
    # Совместимость: любой OpenAI-совместимый сервер на том же хосте, что и раньше «Ollama».
    OLLAMA_BASE_URL: str | None = None
    # Имена моделей: env VLLM_* / LLM_* или устаревшие OLLAMA_* (см. validation_alias).
    OLLAMA_MODEL: str = Field(
        default="Qwen/Qwen2.5-7B-Instruct",
        validation_alias=AliasChoices(
            "VLLM_CHAT_MODEL",
            "LLM_CHAT_MODEL",
            "OLLAMA_MODEL",
        ),
    )
    OLLAMA_MODEL_REASONING: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "VLLM_REASONING_MODEL",
            "LLM_REASONING_MODEL",
            "OLLAMA_MODEL_REASONING",
        ),
    )
    OLLAMA_MODEL_ROUTER: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "VLLM_ROUTER_MODEL",
            "LLM_ROUTER_MODEL",
            "OLLAMA_MODEL_ROUTER",
        ),
    )
    OLLAMA_EMBED_MODEL: str = Field(
        default="BAAI/bge-base-en-v1.5",
        validation_alias=AliasChoices(
            "VLLM_EMBED_MODEL",
            "LLM_EMBED_MODEL",
            "OLLAMA_EMBED_MODEL",
        ),
    )
    LLM_EMBEDDINGS_BASE_URL: str | None = None
    # По умолчанию vLLM: POST /v1/embeddings. Значение ollama — только для Ollama /api/embeddings.
    LLM_EMBEDDING_API_STYLE: Literal["ollama", "openai"] = "openai"
    # Сколько справочных фрагментов подмешивать в контекст (keyword / эмбеддинг).
    AGENT_RAG_TOP_K: int = 3
    # Лимит запросов к POST /agent/chat на пользователя в минуту (0 = без лимита).
    AGENT_CHAT_RATE_LIMIT_PER_MINUTE: int = 30
    # Цикл агента (observe → reason → act → verify → conclude); верхняя граница раундов LLM+tools.
    AGENT_MAX_TOOL_STEPS: int = 5
    # Таймаут HTTP к LLM (секунды).
    AGENT_LLM_TIMEOUT_SEC: float = 120.0
    # Режим песочницы: act-инструменты не пишут в БД (только симуляция / requires_confirmation).
    AGENT_SANDBOX_MODE: bool = True
    # Проверка AgentPolicy (tool_execution) перед вызовом инструментов.
    AGENT_POLICY_ENFORCE: bool = True
    # Автозапись в agent_pending_action при JSON requires_confirmation от act.
    AGENT_AUTO_PENDING_ACTIONS: bool = True
    # После раунда инструментов — доп. LLM-сводка согласованности (нужен настроенный inference).
    AGENT_VERIFY_LLM_PASS: bool = False
    # Воркер: интервал опроса agent_orchestration_job (сек).
    AGENT_ORCHESTRATION_POLL_SEC: float = 30.0
    # Воркер: публикация pending integration_inbox в twin telemetry (сек).
    AGENT_INBOX_TWIN_PULSE_SEC: float = 90.0
    # Обработка integration_inbox → домен + domain_event + проекции (воркер).
    INTEGRATION_INBOX_DOMAIN_ENABLED: bool = True
    INTEGRATION_INBOX_DOMAIN_POLL_SEC: float = 5.0

    # Уведомления «Аналитика двойника» (ensure /notifications/ensure).
    TWIN_NOTIFICATION_ROW_ITEMS_MIN: int = 30
    TWIN_NOTIFICATION_UTILIZATION_MIN: float = 0.9

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        return self


settings = Settings()  # type: ignore

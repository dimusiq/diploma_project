"""
Один authoritative runtime симулятора в процессе FastAPI (архитектура B).

Warehouse Device Server не шарит состояние между процессами: нет Redis lock
и нет отдельного simulation worker. `get_runtime()` — синглтон текущего
процесса. Production-образ должен запускать FastAPI с `--workers 1`, иначе
каждый worker поднимет свой SimulationRuntime.

Слои состояния:

* `WarehouseSimRuntime.world` — часы, позиции, движение, телеметрия, живой журнал;
* `wsim_*` — layout/сценарии/persisted `wsim_event`;
* существующий WMS-домен — бизнес-сущности через `integration.py`.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import threading
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, TypeVar

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.core.db import engine
from app.realtime.sse_common import format_sse, iter_sse_from_queue, put_drop_oldest
from app.services.outbound_fulfillment import annotate_event_orders
from app.warehouse_sim import events as ev
from app.warehouse_sim.delta import (
    diff_data,
    diff_motion,
    envelope,
    should_send_full,
)
from app.warehouse_sim.devices import DeviceServer
from app.warehouse_sim.models import (
    SIM_PAUSED,
    SIM_RUNNING,
    SIM_SPEEDS,
    SIM_STOPPED,
    SimEvent,
    SimRun,
    SimWarehouse,
)
from app.warehouse_sim.scenarios import apply_scenario
from app.warehouse_sim.simulation import (
    advance_world,
    apply_command,
    assign_tasks,
    device_command,
    emergency_stop,
    emit,
    seed_demo_agv_task,
    spawn_inbound_truck,
)
from app.warehouse_sim.snapshot import build_data, build_motion
from app.warehouse_sim.world import DEFAULT_CONFIG, DEMO_CONFIG, create_world

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _fleet_for_world() -> list[dict] | None:
    from app.warehouse_sim.fleet import load_active_runtime_devices

    try:
        with Session(engine) as session:
            return load_active_runtime_devices(session)
    except Exception:
        logger.exception(
            "Не удалось загрузить persistent fleet, используем встроенный парк"
        )
        return None


def _bind_bracelet_links(world: dict[str, Any]) -> None:
    from app.warehouse_sim.bracelets import apply_bracelet_positions, sync_runtime_links
    from app.warehouse_sim.smart_cameras import (
        apply_camera_positions,
        sync_runtime_camera_links,
    )

    try:
        with Session(engine) as session:
            sync_runtime_links(session, world)
            apply_bracelet_positions(world)
            sync_runtime_camera_links(session, world)
            apply_camera_positions(world)
    except Exception:
        logger.exception("Не удалось привязать браслеты/камеры к runtime")
        world.setdefault("braceletLinks", [])
        world.setdefault("smartCameraLinks", [])


TICK_SEC = 0.05
MAX_WALL_STEP = 0.25
DATA_PUBLISH_SEC = 0.25
MOTION_PUBLISH_SEC = 0.1
# Чанк модельного времени для HTTP fast-forward (между чанками отдаём event loop).
FF_CHUNK_MODEL_SEC = 60.0


@dataclass(slots=True)
class _SimSseSub:
    queue: asyncio.Queue[dict]
    want_deltas: bool


class WarehouseSimRuntime:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.world = create_world(fleet=_fleet_for_world())
        _bind_bracelet_links(self.world)
        self.devices = DeviceServer(self.world)
        self.state = SIM_STOPPED
        self.speed = 1.0
        self.version = 0
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subs: list[_SimSseSub] = []
        self._subs_snapshot: tuple[_SimSseSub, ...] = ()
        self._sub_lock = threading.Lock()
        self._last_motion = build_motion(self.world, False, 0)
        self._last_data = build_data(self.world, self.state, self.speed, 0)
        self._last_persisted_seq = 0

    def motion(self) -> dict:
        with self._lock:
            return self._last_motion

    def data(self) -> dict:
        with self._lock:
            return self._last_data

    def read_world(self, *keys: str) -> dict[str, Any]:
        """
        Согласованный снимок выбранных ключей ``world`` под RLock.
        Возвращает deepcopy — вызывающий не держит live-ссылки.
        """
        with self._lock:
            return {k: copy.deepcopy(self.world.get(k)) for k in keys}

    def view_layout(self) -> Any:
        """Топология склада (deepcopy)."""
        return self.read_world("topology").get("topology")

    def view_tasks(
        self,
        *,
        status: str | None = None,
        device_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            tasks = copy.deepcopy(self.world.get("tasks") or [])
        if status:
            tasks = [t for t in tasks if t.get("status") == status]
        if device_id:
            tasks = [t for t in tasks if t.get("deviceId") == device_id]
        return {"data": tasks, "count": len(tasks)}

    def view_orders(self) -> dict[str, Any]:
        with self._lock:
            return {
                "inbound": copy.deepcopy((self.world.get("inbound") or [])[-40:]),
                "outbound": copy.deepcopy((self.world.get("outbound") or [])[-60:]),
                "trucks": copy.deepcopy(self.world.get("trucks") or []),
            }

    def view_devices_list(self) -> dict[str, Any]:
        with self._lock:
            devices = copy.deepcopy(self.world.get("devices") or [])
        return {"data": devices, "count": len(devices)}

    def view_hub(self) -> dict[str, Any]:
        """
        Один locked-снимок layout/tasks/orders (+ счётчики) для согласованного чтения.
        Используется тестами concurrent-доступа и может использоваться хаб-эндпоинтами.
        """
        with self._lock:
            tasks = copy.deepcopy(self.world.get("tasks") or [])
            pallets = self.world.get("pallets") or {}
            return {
                "layout": copy.deepcopy(self.world.get("topology")),
                "tasks": {"data": tasks, "count": len(tasks)},
                "orders": {
                    "inbound": copy.deepcopy((self.world.get("inbound") or [])[-40:]),
                    "outbound": copy.deepcopy((self.world.get("outbound") or [])[-60:]),
                    "trucks": copy.deepcopy(self.world.get("trucks") or []),
                },
                "pallets_total": len(pallets),
                "tasks_total": len(tasks),
            }

    def view_devices_by_code(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {
                d["id"]: copy.deepcopy(d) for d in (self.world.get("devices") or [])
            }

    def view_device(self, device_id: str) -> dict[str, Any] | None:
        with self._lock:
            device = (self.world.get("deviceById") or {}).get(device_id)
            return copy.deepcopy(device) if device is not None else None

    def view_device_telemetry(self, device_id: str) -> dict[str, Any]:
        with self._lock:
            return self.devices.get_device_telemetry(device_id)

    def view_workers(self) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self.world.get("workers") or [])

    def mutate_world(self, fn: Callable[[dict[str, Any]], T]) -> T:
        """Выполнить ``fn(world)`` под RLock (единственный способ мутации снаружи)."""
        with self._lock:
            return fn(self.world)

    def refresh_and_publish(self) -> None:
        """Пересобрать motion/data и разослать подписчикам (под RLock)."""
        with self._lock:
            self._refresh()
            self._publish("data", self._last_data)
            self._publish("motion", self._last_motion)

    def flush_integration(self) -> None:
        """Публичный flush очереди интеграции в WMS."""
        self._flush_integration()

    def drain_vision(self) -> None:
        """Публичный слив vision_outbox в SSE."""
        self._drain_vision()

    def advance_model(self, seconds: float, *, refresh: bool = True) -> None:
        """Продвижение модельного времени под RLock без DB-flush (тики/тесты)."""
        with self._lock:
            advance_world(self.world, max(0.0, float(seconds)))
            if refresh:
                self._refresh()

    def control_camera(
        self,
        device_id: str,
        action: str,
        confidence_threshold: float | None = None,
        class_name: str | None = None,
        entity_id: str | None = None,
    ) -> dict[str, Any]:
        """Управление камерой под lock + refresh; затем vision/integration flush."""
        from app.warehouse_sim.vision.service import control_camera as _control

        with self._lock:
            live = (self.world.get("deviceById") or {}).get(device_id)
            if live is None:
                raise KeyError(device_id)
            status = _control(
                self.world,
                live,
                action,
                confidence_threshold,
                class_name,
                entity_id,
            )
            self._refresh()
        self._drain_vision()
        self._flush_integration()
        return status

    def rebind_smart_cameras(self) -> None:
        """Перепривязка smart-camera links + publish (под RLock)."""
        from sqlmodel import Session

        from app.warehouse_sim.smart_cameras import (
            apply_camera_positions,
            sync_runtime_camera_links,
        )

        with self._lock:
            with Session(engine) as session:
                sync_runtime_camera_links(session, self.world)
                apply_camera_positions(self.world)
            self._refresh()
            self._publish("data", self._last_data)
            self._publish("motion", self._last_motion)

    def sync_personnel_links(self, session: Session) -> None:
        """Синхронизация браслетов/позиций персонала + publish."""
        from app.warehouse_sim.bracelets import (
            apply_bracelet_positions,
            sync_runtime_links,
        )

        with self._lock:
            sync_runtime_links(session, self.world)
            apply_bracelet_positions(self.world)
            self._refresh()
            self._publish("data", self._last_data)
            self._publish("motion", self._last_motion)

    def start_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._stop.clear()
        if self._task is None or self._task.done():
            self._task = loop.create_task(self._run())

    async def aclose(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def _rebuild_subs_snapshot(self) -> None:
        self._subs_snapshot = tuple(self._subs)

    def subscribe(self, *, want_deltas: bool = False) -> asyncio.Queue[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=32)
        with self._sub_lock:
            self._subs.append(_SimSseSub(queue=q, want_deltas=want_deltas))
            self._rebuild_subs_snapshot()
        return q

    def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        with self._sub_lock:
            self._subs = [s for s in self._subs if s.queue is not q]
            self._rebuild_subs_snapshot()

    def _broadcast(self, msg: dict) -> None:
        """Произвольное сообщение (camera.* и т.п.) — всем подписчикам."""
        for s in self._subs_snapshot:
            put_drop_oldest(s.queue, msg)

    def _broadcast_snapshot(
        self,
        kind: str,
        payload: dict,
        prev: dict | None,
    ) -> None:
        """
        motion/data: legacy-клиентам — полный payload;
        подписчикам с deltas=1 — mode=delta (или full, если дельта невыгодна).
        """
        ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        revision = int(payload.get("version") or 0)
        legacy = {"v": 1, "type": kind, "ts": ts, "payload": payload}
        full_env = envelope(kind, revision=revision, mode="full", payload=payload)
        full_env["ts"] = ts

        delta_env: dict[str, Any] | None = None
        if prev is not None:
            patch = (
                diff_motion(prev, payload)
                if kind == "motion"
                else diff_data(prev, payload)
            )
            if patch is not None and not should_send_full(patch, payload):
                base_rev = int(prev.get("version") or 0)
                delta_env = envelope(
                    kind,
                    revision=revision,
                    mode="delta",
                    payload=patch,
                    base_revision=base_rev,
                )
                delta_env["ts"] = ts

        for s in self._subs_snapshot:
            if s.want_deltas and delta_env is not None:
                put_drop_oldest(s.queue, delta_env)
            elif s.want_deltas:
                put_drop_oldest(s.queue, full_env)
            else:
                put_drop_oldest(s.queue, legacy)

    def _publish(self, kind: str, payload: dict) -> None:
        """
        Публикация из sync-кода. Для motion/data после _refresh —
        полный кадр (редкие control-события). Горячий путь тика — _broadcast_snapshot.
        """
        ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if kind in ("motion", "data"):
            revision = int(payload.get("version") or 0)
            legacy = {"v": 1, "type": kind, "ts": ts, "payload": payload}
            full_env = envelope(kind, revision=revision, mode="full", payload=payload)
            full_env["ts"] = ts
            loop = self._loop
            if loop is None:
                return

            def _run_full() -> None:
                for s in self._subs_snapshot:
                    put_drop_oldest(s.queue, full_env if s.want_deltas else legacy)

            try:
                loop.call_soon_threadsafe(_run_full)
            except RuntimeError:
                pass
            return

        msg = {"v": 1, "type": kind, "ts": ts, "payload": payload}
        loop = self._loop
        if loop is None:
            return

        def _run() -> None:
            self._broadcast(msg)

        try:
            loop.call_soon_threadsafe(_run)
        except RuntimeError:
            pass

    def _refresh(self) -> None:
        self.version += 1
        running = self.state == SIM_RUNNING
        self._last_motion = build_motion(self.world, running, self.version)
        self._last_data = build_data(self.world, self.state, self.speed, self.version)
        self.devices.bind(self.world)

    def _drain_vision(self) -> None:
        with self._lock:
            pending = list(self.world.get("vision_outbox") or [])
            self.world["vision_outbox"] = []
        for item in pending:
            self._publish(
                str(item.get("type") or "camera.status"), item.get("payload") or {}
            )

    def integration_metrics(self) -> dict[str, int]:
        """Счётчики lag/ошибок интеграции (для диагностики)."""
        with self._lock:
            lag = len(self.world.get("integration_queue") or [])
        return {
            "applied": int(getattr(self, "_integration_applied", 0)),
            "errors": int(getattr(self, "_integration_errors", 0)),
            "requeued": int(getattr(self, "_integration_requeued", 0)),
            "lag": lag,
        }

    def _flush_integration(self) -> None:
        """
        Сливает integration_queue в WMS. Очередь очищается до apply, но при любой
        ошибке события возвращаются в world (без потери). wsim_event — как раньше:
        seq двигается только после успешной записи.
        """
        with self._lock:
            world = self.world
            queue = list(world.get("integration_queue") or [])
            world["integration_queue"] = []
            pending_events = [
                e
                for e in world.get("events") or []
                if int(e.get("id") or 0) > self._last_persisted_seq
            ]
        if pending_events:
            try:
                with Session(engine) as session:
                    written_max = persist_new_sim_events(session, pending_events)
                if written_max:
                    with self._lock:
                        self._last_persisted_seq = max(
                            self._last_persisted_seq, written_max
                        )
            except Exception:
                logger.exception(
                    "Warehouse Device Server: не удалось сохранить журнал событий"
                )
        if not queue:
            return
        try:
            from app.warehouse_sim.integration import apply_integration_queue

            with Session(engine) as session:
                result = apply_integration_queue(session, world, queue=queue)
            applied = int(result.get("applied") or 0)
            requeued = int(result.get("requeued") or 0)
            errors = int(result.get("errors") or 0)
            self._integration_applied = (
                int(getattr(self, "_integration_applied", 0)) + applied
            )
            self._integration_requeued = (
                int(getattr(self, "_integration_requeued", 0)) + requeued
            )
            self._integration_errors = (
                int(getattr(self, "_integration_errors", 0)) + errors
            )
            if errors or requeued:
                logger.error(
                    "Warehouse Device Server: integration batch errors=%s requeued=%s lag=%s",
                    errors,
                    requeued,
                    len(world.get("integration_queue") or []),
                )
        except Exception:
            # apply не успел вернуть очередь — восстанавливаем здесь
            with self._lock:
                pending = list(world.get("integration_queue") or [])
                world["integration_queue"] = list(queue) + pending
            self._integration_errors = int(getattr(self, "_integration_errors", 0)) + 1
            self._integration_requeued = int(
                getattr(self, "_integration_requeued", 0)
            ) + len(queue)
            logger.exception(
                "Warehouse Device Server: не удалось применить доменные изменения; "
                "события возвращены в очередь (%s)",
                len(queue),
            )

    def _seed_domain_inventory(self) -> None:
        try:
            from app.warehouse_sim.integration import seed_world_inventory

            with self._lock:
                world = self.world
            with Session(engine) as session:
                seed_world_inventory(session, world)
        except Exception:
            logger.exception(
                "Warehouse Device Server: не удалось синхронизировать остатки"
            )

    def _reset_domain(self) -> None:
        try:
            from app.warehouse_sim.integration import reset_demo_domain

            with Session(engine) as session:
                reset_demo_domain(session)
        except Exception:
            logger.exception(
                "Warehouse Device Server: не удалось сбросить доменные данные"
            )

    def start(self) -> dict:
        self._seed_domain_inventory()
        with self._lock:
            if self.state != SIM_RUNNING:
                self.state = SIM_RUNNING
                emit(self.world, ev.SYSTEM_STARTED, "info", "Симуляция запущена")
                self._refresh()
                self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def pause(self) -> dict:
        with self._lock:
            if self.state == SIM_RUNNING:
                self.state = SIM_PAUSED
                emit(self.world, ev.SYSTEM_PAUSED, "warning", "Симуляция на паузе")
                self._refresh()
                self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def stop(self) -> dict:
        with self._lock:
            if self.state != SIM_STOPPED:
                self.state = SIM_STOPPED
                emergency_stop(self.world)
                emit(self.world, ev.SYSTEM_STOPPED, "warning", "Симуляция остановлена")
                self._refresh()
                self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def reset(self, config: dict | None = None) -> dict:
        self._reset_domain()
        with self._lock:
            cfg = {**self.world.get("config", DEFAULT_CONFIG), **(config or {})}
            self.world = create_world(cfg, fleet=_fleet_for_world())
            _bind_bracelet_links(self.world)
            self.devices.bind(self.world)
            self.state = SIM_STOPPED
            self._last_persisted_seq = 0
            emit(self.world, ev.SYSTEM_RESET, "info", "Симуляция сброшена")
            self._refresh()
            self._publish("data", self._last_data)
        self._seed_domain_inventory()
        self._flush_integration()
        return self.data()

    def start_demo(self) -> dict:
        self._reset_domain()
        with self._lock:
            self.world = create_world(DEMO_CONFIG, fleet=_fleet_for_world())
            _bind_bracelet_links(self.world)
            self.devices.bind(self.world)
            self.state = SIM_STOPPED
            self.speed = 10.0
            self._last_persisted_seq = 0
            spawn_inbound_truck(self.world)
            seed_demo_agv_task(self.world)
            assign_tasks(self.world)
            emit(
                self.world,
                ev.SYSTEM_STARTED,
                "info",
                "Демонстрационный сценарий склада запущен",
            )
            self.state = SIM_RUNNING
            from app.warehouse_sim.vision.service import ensure_camera, start_camera

            agv = self.world["deviceById"].get("agv-1")
            if agv is not None and ensure_camera(agv) is not None:
                start_camera(self.world, agv)
            self._refresh()
            self._publish("data", self._last_data)
            self._drain_vision()
        self._seed_domain_inventory()
        self._flush_integration()
        return self.data()

    def reset_demo(self) -> dict:
        return self.reset(dict(DEMO_CONFIG))

    def sync_fleet_device(self, row: Any, *, previous_code: str | None = None) -> None:
        """Безопасный hot-update identity/enabled без пересоздания мира."""
        from app.warehouse_sim.fleet import row_to_runtime

        with self._lock:
            lookup = previous_code or row.code
            device = self.world["deviceById"].get(lookup) or self.world[
                "deviceById"
            ].get(row.code)
            if row.archived:
                if device is not None:
                    device["enabled"] = False
                    device["online"] = False
                    if not device.get("taskId"):
                        device["status"] = "offline"
                self._refresh()
                self._publish("data", self._last_data)
                self._publish("motion", self._last_motion)
                return
            if device is None:
                if row.enabled:
                    self.devices.register_device(row_to_runtime(row))
            else:
                device["name"] = row.name
                device["enabled"] = bool(row.enabled)
                device["inMaintenance"] = bool((row.meta or {}).get("inMaintenance"))
                if not row.enabled:
                    device["online"] = False
                    if not device.get("taskId"):
                        device["status"] = "offline"
                elif device["inMaintenance"] and not device.get("taskId"):
                    device["status"] = "maintenance"
                elif device.get("status") in ("offline", "maintenance"):
                    device["online"] = True
                    device["status"] = "idle"
                if self.state != SIM_RUNNING and not device.get("taskId"):
                    device["speed"] = float(row.speed_mps or 0)
                    if row.battery is not None:
                        device["battery"] = row.battery
            self._refresh()
            self._publish("data", self._last_data)
            self._publish("motion", self._last_motion)

    def set_speed(self, speed: float) -> dict:
        if speed not in SIM_SPEEDS:
            raise ValueError("Недопустимая скорость")
        with self._lock:
            self.speed = float(speed)
            self._refresh()
            self._publish("data", self._last_data)
        return self.data()

    def set_config(self, patch: dict) -> dict:
        with self._lock:
            self.world["config"].update(patch)
            self._refresh()
            self._publish("data", self._last_data)
        return self.data()

    def command(self, body: dict) -> dict:
        with self._lock:
            apply_command(self.world, body)
            self._refresh()
            self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def send_device_command(
        self, device_id: str, command: str, payload: dict | None = None
    ) -> dict:
        with self._lock:
            device_command(self.world, device_id, command, payload)
            self._refresh()
            self._publish("data", self._last_data)
            telemetry = self.devices.get_device_telemetry(device_id)
        self._flush_integration()
        return telemetry

    def apply_scenario(self, code: str) -> dict:
        with self._lock:
            apply_scenario(self.world, code)
            self._refresh()
            self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def inject_event(
        self, event_type: str, device_id: str | None, message: str | None
    ) -> dict:
        with self._lock:
            if event_type == ev.EMERGENCY_STOP:
                emergency_stop(self.world)
            elif event_type == ev.DEVICE_ERROR and device_id:
                device_command(self.world, device_id, "FAIL")
            elif event_type == ev.AGV_BATTERY_LOW and device_id:
                device = self.world["deviceById"].get(device_id)
                if device and device.get("battery") is not None:
                    device["battery"] = 12
                    apply_command(
                        self.world, {"type": "recallToCharge", "deviceId": device_id}
                    )
            elif event_type == ev.CONVEYOR_BLOCKED:
                conv = self.world["deviceById"].get("cnv-2")
                if conv:
                    conv["status"] = "jam"
                    conv["repairTimer"] = 120
                    emit(
                        self.world,
                        ev.CONVEYOR_BLOCKED,
                        "error",
                        message or f"{conv['name']} заблокирован вручную",
                        device_id=conv["id"],
                    )
            elif event_type == ev.ZONE_CONGESTED:
                emit(
                    self.world,
                    ev.ZONE_CONGESTED,
                    "warning",
                    message or "Зона перегружена (ручное событие)",
                )
            elif event_type == ev.SENSOR_ALARM and device_id:
                device = self.world["deviceById"].get(device_id)
                if device:
                    device["alarm"] = True
                    emit(
                        self.world,
                        ev.SENSOR_ALARM,
                        "warning",
                        message or f"{device['name']}: ручная авария",
                        device_id=device_id,
                    )
            else:
                emit(
                    self.world,
                    event_type,
                    "warning",
                    message or event_type,
                    device_id=device_id,
                )
            self._refresh()
            self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def fast_forward(self, seconds: float) -> dict:
        """Синхронный fast-forward (тесты/скрипты). HTTP — ``fast_forward_async``."""
        with self._lock:
            advance_world(self.world, max(0.0, seconds))
            self._refresh()
            self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    async def fast_forward_async(self, seconds: float) -> dict:
        """
        Продвижение модельного времени чанками с отдачей event loop.

        Контракт ответа совпадает с ``fast_forward``: актуальный data-снимок.
        DB-flush выполняется в threadpool, чтобы не стопорить SSE.
        """
        remaining = max(0.0, float(seconds))
        while remaining > 1e-9:
            chunk = min(FF_CHUNK_MODEL_SEC, remaining)
            with self._lock:
                advance_world(self.world, chunk)
                self._refresh()
            await asyncio.to_thread(self._flush_integration)
            remaining -= chunk
            await asyncio.sleep(0)
        with self._lock:
            self._refresh()
            self._publish("data", self._last_data)
        return self.data()

    async def _flush_integration_async(self) -> None:
        """Sync DB flush вне event loop (threadpool)."""
        await asyncio.to_thread(self._flush_integration)

    async def _run(self) -> None:
        last = asyncio.get_running_loop().time()
        data_acc = 0.0
        motion_acc = 0.0
        while not self._stop.is_set():
            await asyncio.sleep(TICK_SEC)
            now = asyncio.get_running_loop().time()
            wall = min(MAX_WALL_STEP, now - last)
            last = now
            if wall <= 0:
                continue
            motion: dict | None = None
            motion_prev: dict | None = None
            data: dict | None = None
            data_prev: dict | None = None
            with self._lock:
                if self.state == SIM_RUNNING:
                    advance_world(self.world, wall * self.speed)
                motion_acc += wall
                data_acc += wall
                if motion_acc >= MOTION_PUBLISH_SEC:
                    motion_acc = 0
                    motion_prev = self._last_motion
                    self.version += 1
                    self._last_motion = build_motion(
                        self.world, self.state == SIM_RUNNING, self.version
                    )
                    motion = self._last_motion
                if data_acc >= DATA_PUBLISH_SEC:
                    data_acc = 0
                    data_prev = self._last_data
                    self.version += 1
                    self._last_data = build_data(
                        self.world, self.state, self.speed, self.version
                    )
                    data = self._last_data
            await self._flush_integration_async()
            self._drain_vision()
            if motion is not None:
                self._broadcast_snapshot("motion", motion, motion_prev)
            if data is not None:
                self._broadcast_snapshot("data", data, data_prev)


_runtime: WarehouseSimRuntime | None = None
_runtime_lock = threading.Lock()


def get_runtime() -> WarehouseSimRuntime:
    global _runtime
    with _runtime_lock:
        if _runtime is None:
            _runtime = WarehouseSimRuntime()
        return _runtime


async def start_runtime() -> None:
    rt = get_runtime()
    rt.start_loop(asyncio.get_running_loop())
    logger.info("Warehouse Device Server runtime started (STOPPED)")


async def stop_runtime() -> None:
    global _runtime
    with _runtime_lock:
        rt = _runtime
    if rt is not None:
        await rt.aclose()


def ensure_seed_layout() -> None:
    """Пишет план склада в БД один раз, чтобы таблицы wsim_* не были пустыми."""
    from app.warehouse_sim.seed import seed_if_empty

    with Session(engine) as session:
        seed_if_empty(session)


async def sse_stream(
    rt: WarehouseSimRuntime,
    *,
    deltas: bool = False,
    since: int | None = None,
) -> AsyncIterator[bytes]:
    """
    SSE склада. По умолчанию — полные снапшоты (обратная совместимость).

    ``deltas=True``: первый кадр full (если since устарел), далее mode=delta.
    ``since=<revision>``: пропустить начальный full, если клиент уже на актуальной ревизии.
    """
    q = rt.subscribe(want_deltas=deltas)
    data = rt.data()
    motion = rt.motion()
    cur_rev = max(int(data.get("version") or 0), int(motion.get("version") or 0))
    start: list[bytes] = [
        format_sse({"type": "ready", "deltas": bool(deltas), "revision": cur_rev})
    ]
    need_full = True
    if deltas and since is not None and int(since) >= cur_rev:
        need_full = False
    if need_full:
        if deltas:
            start.append(
                format_sse(
                    envelope(
                        "data",
                        revision=int(data.get("version") or 0),
                        mode="full",
                        payload=data,
                    )
                )
            )
            start.append(
                format_sse(
                    envelope(
                        "motion",
                        revision=int(motion.get("version") or 0),
                        mode="full",
                        payload=motion,
                    )
                )
            )
        else:
            start.append(format_sse({"type": "data", "payload": data}))
            start.append(format_sse({"type": "motion", "payload": motion}))
    try:
        async for chunk in iter_sse_from_queue(q, on_start=start):
            yield chunk
    finally:
        rt.unsubscribe(q)


def persist_new_sim_events(session: Session, events: list[dict[str, Any]]) -> int:
    """Пишет новые события в wsim_event. SENSOR_READING остаётся только в памяти."""
    if not events:
        return 0
    db_max = session.exec(select(func.max(SimEvent.seq))).one()
    db_max = int(db_max or 0)
    seen_max = 0
    to_write: list[dict[str, Any]] = []
    for event in events:
        seq = int(event.get("id") or 0)
        seen_max = max(seen_max, seq)
        if seq <= db_max:
            continue
        if event.get("type") == ev.SENSOR_READING:
            continue
        to_write.append(event)
    if not to_write and seen_max <= db_max:
        return db_max
    if to_write:
        to_write.sort(key=lambda item: int(item["id"]))
        warehouse = session.exec(
            select(SimWarehouse).where(SimWarehouse.code == "DEMO")
        ).first()
        warehouse_id = warehouse.id if warehouse is not None else None
        for event in to_write:
            session.add(
                SimEvent(
                    seq=int(event["id"]),
                    warehouse_id=warehouse_id,
                    sim_time_sec=float(event.get("at") or 0),
                    event_type=str(event.get("type") or "")[:48],
                    severity=str(event.get("severity") or "info")[:16],
                    message=str(event.get("message") or "")[:512],
                    payload={
                        "deviceId": event.get("deviceId"),
                        "entityId": event.get("entityId"),
                        "zoneId": event.get("zoneId"),
                        "taskId": event.get("taskId"),
                        "orderId": event.get("orderId"),
                    },
                )
            )
        session.commit()
    return max(seen_max, db_max)


def _event_matches(
    event: dict[str, Any],
    *,
    severity: str | None,
    event_type: str | None,
    q: str | None,
    device_id: str | None,
) -> bool:
    if severity and event.get("severity") != severity:
        return False
    if event_type and event.get("type") != event_type:
        return False
    if device_id and event.get("deviceId") != device_id:
        return False
    if q:
        needle = q.lower()
        haystack = f"{event.get('type') or ''} {event.get('message') or ''}".lower()
        if needle not in haystack:
            return False
    return True


def _row_to_event(row: SimEvent) -> dict[str, Any]:
    payload = row.payload or {}
    return {
        "id": row.seq,
        "at": row.sim_time_sec,
        "type": row.event_type,
        "severity": row.severity,
        "message": row.message,
        "deviceId": payload.get("deviceId"),
        "entityId": payload.get("entityId"),
        "zoneId": payload.get("zoneId"),
        "taskId": payload.get("taskId"),
        "orderId": payload.get("orderId"),
    }


def query_event_log(
    session: Session,
    rt: WarehouseSimRuntime,
    *,
    severity: str | None = None,
    event_type: str | None = None,
    q: str | None = None,
    device_id: str | None = None,
    skip: int = 0,
    limit: int = 200,
    from_ts: datetime | None = None,
    to_ts: datetime | None = None,
) -> dict[str, Any]:
    """
    Realtime-буфер из памяти + история из PostgreSQL (`wsim_event`).

    Фильтры и пагинация истории — в SQL (WHERE + ORDER BY seq DESC + OFFSET/LIMIT).
    SENSOR_READING только в памяти: при их наличии в окно страницы подмешиваем
    `LIMIT skip+limit` из БД и режем страницу после merge (иначе чистый OFFSET).
    """
    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 500))

    with rt._lock:
        memory_events = list(rt.world.get("events") or [])
    persist_new_sim_events(session, memory_events)

    include_memory = to_ts is None
    memory: list[dict[str, Any]] = []
    if include_memory:
        memory = [
            event
            for event in memory_events
            if _event_matches(
                event,
                severity=severity,
                event_type=event_type,
                q=q,
                device_id=device_id,
            )
        ]
    # После persist несенсорные события уже в БД; memory-only — SENSOR_READING.
    memory_only = [e for e in memory if e.get("type") == ev.SENSOR_READING]
    sensor_count = len(memory_only)

    conditions = []
    if severity:
        conditions.append(SimEvent.severity == severity)
    if event_type:
        conditions.append(SimEvent.event_type == event_type)
    if q:
        needle = f"%{q}%"
        conditions.append(
            or_(SimEvent.message.ilike(needle), SimEvent.event_type.ilike(needle))
        )
    if device_id:
        # @> — под GIN(jsonb_path_ops) / GIN(jsonb)
        conditions.append(SimEvent.payload.contains({"deviceId": device_id}))
    if from_ts is not None:
        conditions.append(SimEvent.occurred_at >= from_ts)
    if to_ts is not None:
        conditions.append(SimEvent.occurred_at <= to_ts)

    stmt = select(SimEvent)
    count_stmt = select(func.count()).select_from(SimEvent)
    if conditions:
        clause = and_(*conditions)
        stmt = stmt.where(clause)
        count_stmt = count_stmt.where(clause)

    db_count = int(session.exec(count_stmt).one() or 0)
    ordered_stmt = stmt.order_by(SimEvent.seq.desc())

    if not memory_only:
        rows = list(
            session.exec(ordered_stmt.offset(skip).limit(limit)).all()
        )
        page_events = [_row_to_event(row) for row in rows]
        # Оверлей live-полей из memory по seq (те же id, что уже в БД).
        by_id = {int(e["id"]): e for e in memory}
        page_events = [by_id.get(int(e["id"]), e) for e in page_events]
        ordered = annotate_event_orders(session, page_events)
        return {"data": ordered, "count": db_count}

    # Сенсоры сдвигают ранги: берём верх skip+limit из БД, merge, затем slice.
    rows = list(session.exec(ordered_stmt.limit(skip + limit)).all())
    merged: dict[int, dict[str, Any]] = {}
    for row in rows:
        merged[int(row.seq)] = _row_to_event(row)
    for event in memory:
        merged[int(event["id"])] = event
    ordered = annotate_event_orders(
        session, sorted(merged.values(), key=lambda item: int(item["id"]), reverse=True)
    )
    return {
        "data": ordered[skip : skip + limit],
        "count": db_count + sensor_count,
    }


def persist_run_row(session: Session, rt: WarehouseSimRuntime) -> None:
    wh = session.exec(select(SimWarehouse).where(SimWarehouse.code == "DEMO")).first()
    if wh is None:
        return
    row = session.exec(select(SimRun).where(SimRun.is_active.is_(True))).first()
    now = datetime.now(timezone.utc)
    if row is None:
        row = SimRun(warehouse_id=wh.id, is_active=True)
        session.add(row)
    row.state = rt.state
    row.speed = rt.speed
    row.sim_time_sec = rt.world["timeSec"]
    row.config = dict(rt.world["config"])
    row.kpi = dict(rt.data().get("kpi") or {})
    row.updated_at = now
    session.add(row)
    session.commit()

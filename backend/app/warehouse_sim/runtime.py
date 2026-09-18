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
import json
import logging
import threading
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.core.db import engine
from app.warehouse_sim import events as ev
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
    device_command,
    emergency_stop,
    emit,
    spawn_inbound_truck,
)
from app.warehouse_sim.snapshot import build_data, build_motion
from app.warehouse_sim.world import DEFAULT_CONFIG, DEMO_CONFIG, create_world

logger = logging.getLogger(__name__)

TICK_SEC = 0.05
MAX_WALL_STEP = 0.25
DATA_PUBLISH_SEC = 0.25
MOTION_PUBLISH_SEC = 0.1


class WarehouseSimRuntime:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.world = create_world()
        self.devices = DeviceServer(self.world)
        self.state = SIM_STOPPED
        self.speed = 1.0
        self.version = 0
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subs: list[asyncio.Queue[dict]] = []
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

    def subscribe(self) -> asyncio.Queue[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=32)
        with self._sub_lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        with self._sub_lock:
            self._subs[:] = [s for s in self._subs if s is not q]

    def _broadcast(self, msg: dict) -> None:
        with self._sub_lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    pass

    def _publish(self, kind: str, payload: dict) -> None:
        msg = {
            "v": 1,
            "type": kind,
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "payload": payload,
        }
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

    def _flush_integration(self) -> None:
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
                        self._last_persisted_seq = max(self._last_persisted_seq, written_max)
            except Exception:
                logger.exception("Warehouse Device Server: не удалось сохранить журнал событий")
        if not queue:
            return
        try:
            from app.warehouse_sim.integration import apply_integration_queue

            with Session(engine) as session:
                apply_integration_queue(session, world, queue=queue)
        except Exception:
            logger.exception("Warehouse Device Server: не удалось применить доменные изменения")

    def _seed_domain_inventory(self) -> None:
        try:
            from app.warehouse_sim.integration import seed_world_inventory

            with self._lock:
                world = self.world
            with Session(engine) as session:
                seed_world_inventory(session, world)
        except Exception:
            logger.exception("Warehouse Device Server: не удалось синхронизировать остатки")

    def _reset_domain(self) -> None:
        try:
            from app.warehouse_sim.integration import reset_demo_domain

            with Session(engine) as session:
                reset_demo_domain(session)
        except Exception:
            logger.exception("Warehouse Device Server: не удалось сбросить доменные данные")

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
            self.world = create_world(cfg)
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
            self.world = create_world(DEMO_CONFIG)
            self.devices.bind(self.world)
            self.state = SIM_STOPPED
            self.speed = 10.0
            self._last_persisted_seq = 0
            spawn_inbound_truck(self.world)
            emit(
                self.world,
                ev.SYSTEM_STARTED,
                "info",
                "Демонстрационный сценарий склада запущен",
            )
            self.state = SIM_RUNNING
            self._refresh()
            self._publish("data", self._last_data)
        self._seed_domain_inventory()
        self._flush_integration()
        return self.data()

    def reset_demo(self) -> dict:
        return self.reset(dict(DEMO_CONFIG))

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

    def send_device_command(self, device_id: str, command: str, payload: dict | None = None) -> dict:
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

    def inject_event(self, event_type: str, device_id: str | None, message: str | None) -> dict:
        with self._lock:
            if event_type == ev.EMERGENCY_STOP:
                emergency_stop(self.world)
            elif event_type == ev.DEVICE_ERROR and device_id:
                device_command(self.world, device_id, "FAIL")
            elif event_type == ev.AGV_BATTERY_LOW and device_id:
                device = self.world["deviceById"].get(device_id)
                if device and device.get("battery") is not None:
                    device["battery"] = 12
                    apply_command(self.world, {"type": "recallToCharge", "deviceId": device_id})
            elif event_type == ev.CONVEYOR_BLOCKED:
                conv = self.world["deviceById"].get("cnv-2")
                if conv:
                    conv["status"] = "jam"
                    conv["repairTimer"] = 120
                    emit(self.world, ev.CONVEYOR_BLOCKED, "error", message or f"{conv['name']} заблокирован вручную", device_id=conv["id"])
            elif event_type == ev.ZONE_CONGESTED:
                emit(self.world, ev.ZONE_CONGESTED, "warning", message or "Зона перегружена (ручное событие)")
            elif event_type == ev.SENSOR_ALARM and device_id:
                device = self.world["deviceById"].get(device_id)
                if device:
                    device["alarm"] = True
                    emit(self.world, ev.SENSOR_ALARM, "warning", message or f"{device['name']}: ручная авария", device_id=device_id)
            else:
                emit(self.world, event_type, "warning", message or event_type, device_id=device_id)
            self._refresh()
            self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

    def fast_forward(self, seconds: float) -> dict:
        with self._lock:
            advance_world(self.world, max(0.0, seconds))
            self._refresh()
            self._publish("data", self._last_data)
        self._flush_integration()
        return self.data()

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
            with self._lock:
                if self.state == SIM_RUNNING:
                    advance_world(self.world, wall * self.speed)
                motion_acc += wall
                data_acc += wall
                if motion_acc >= MOTION_PUBLISH_SEC:
                    motion_acc = 0
                    self.version += 1
                    self._last_motion = build_motion(
                        self.world, self.state == SIM_RUNNING, self.version
                    )
                    motion = self._last_motion
                else:
                    motion = None
                if data_acc >= DATA_PUBLISH_SEC:
                    data_acc = 0
                    self.version += 1
                    self._last_data = build_data(self.world, self.state, self.speed, self.version)
                    data = self._last_data
                else:
                    data = None
            self._flush_integration()
            if motion is not None:
                self._broadcast(
                    {
                        "v": 1,
                        "type": "motion",
                        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "payload": motion,
                    }
                )
            if data is not None:
                self._broadcast(
                    {
                        "v": 1,
                        "type": "data",
                        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "payload": data,
                    }
                )


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


async def sse_stream(rt: WarehouseSimRuntime) -> AsyncIterator[bytes]:
    q = rt.subscribe()
    try:
        yield _sse({"type": "ready"})
        yield _sse({"type": "data", "payload": rt.data()})
        yield _sse({"type": "motion", "payload": rt.motion()})
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
                yield _sse(msg)
            except asyncio.TimeoutError:
                yield b": ping\n\n"
    finally:
        rt.unsubscribe(q)


def _sse(data: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n".encode()


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
        warehouse = session.exec(select(SimWarehouse).where(SimWarehouse.code == "DEMO")).first()
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
    """Realtime-буфер из памяти + история из PostgreSQL (`wsim_event`)."""
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
    fetch_limit = min(2000, skip + limit + max(len(memory), 50))
    rows = list(session.exec(stmt.order_by(SimEvent.seq.desc()).limit(fetch_limit)).all())

    merged: dict[int, dict[str, Any]] = {}
    for row in rows:
        merged[int(row.seq)] = _row_to_event(row)
    for event in memory:
        merged[int(event["id"])] = event
    ordered = sorted(merged.values(), key=lambda item: int(item["id"]), reverse=True)
    sensor_count = sum(1 for event in memory if event.get("type") == ev.SENSOR_READING)
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

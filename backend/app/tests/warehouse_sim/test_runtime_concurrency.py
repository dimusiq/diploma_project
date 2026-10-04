"""P1-7: параллельный tick + читатели layout/tasks/orders без рассинхрона."""

from __future__ import annotations

import threading
import time

from app.warehouse_sim.runtime import WarehouseSimRuntime


def test_concurrent_tick_and_hub_readers() -> None:
    rt = WarehouseSimRuntime()
    stop = threading.Event()
    errors: list[BaseException] = []
    read_count = 0
    read_lock = threading.Lock()

    def ticker() -> None:
        try:
            while not stop.is_set():
                # без refresh — дешевле держать lock занятым тиком, как в runtime
                rt.advance_model(0.05, refresh=False)
                time.sleep(0.001)
        except BaseException as exc:  # noqa: BLE001 — собираем в общий список
            errors.append(exc)

    def reader() -> None:
        nonlocal read_count
        try:
            for _ in range(20):
                if stop.is_set():
                    break
                hub = rt.view_hub()
                tasks = hub["tasks"]
                orders = hub["orders"]
                layout = hub["layout"]
                assert tasks["count"] == len(tasks["data"])
                assert hub["tasks_total"] == tasks["count"]
                assert isinstance(orders["inbound"], list)
                assert isinstance(orders["outbound"], list)
                assert isinstance(orders["trucks"], list)
                assert isinstance(layout, dict)
                assert isinstance(hub["pallets_total"], int)
                assert hub["pallets_total"] >= 0
                with read_lock:
                    read_count += 1
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=ticker, name="tick")]
    threads += [threading.Thread(target=reader, name=f"r{i}") for i in range(10)]
    for t in threads:
        t.start()
    deadline = time.monotonic() + 20.0
    while time.monotonic() < deadline:
        with read_lock:
            if read_count >= 150 and not errors:
                break
        time.sleep(0.05)
    stop.set()
    for t in threads:
        t.join(timeout=5.0)

    assert not errors, f"ошибки concurrent-доступа: {errors[:3]!r}"
    assert read_count >= 150, f"мало успешных чтений: {read_count}"


def test_view_methods_do_not_expose_live_world_refs() -> None:
    rt = WarehouseSimRuntime()
    tasks_a = rt.view_tasks()["data"]
    rt.mutate_world(
        lambda w: w.setdefault("tasks", []).append({"id": "probe-task"})
    )
    tasks_b = rt.view_tasks()["data"]
    # старый снимок не должен «подхватить» новую задачу через общую ссылку
    assert all(t.get("id") != "probe-task" for t in tasks_a)
    assert any(t.get("id") == "probe-task" for t in tasks_b)

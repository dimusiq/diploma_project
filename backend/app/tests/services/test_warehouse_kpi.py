"""P3-16: формулы KPI склада (фиксированные входы → ожидаемые значения)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.warehouse_kpi import (
    WarehouseKpiSnapshot,
    dead_stock_ratio,
    dock_to_stock_hours,
    dock_utilization,
    mean,
    order_cycle_hours,
    otif_from_shipments,
    plan_fact_ratio,
    productivity_rate,
    ratio,
    stock_accuracy_from_variances,
    warehouse_kpi_csv,
    work_order_downtime_hours,
)


def test_stock_accuracy_perfect_and_partial() -> None:
    assert stock_accuracy_from_variances([]) is None
    assert stock_accuracy_from_variances([None, None]) is None
    assert stock_accuracy_from_variances([0, 0, 0]) == 1.0
    assert stock_accuracy_from_variances([0, -2, 0, 1]) == 0.5
    assert stock_accuracy_from_variances([0, None, 0]) == 1.0


def test_otif_on_time_late_and_no_deadline() -> None:
    t0 = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
    deadline = datetime(2026, 1, 10, 18, 0, tzinfo=timezone.utc)
    late = datetime(2026, 1, 11, 9, 0, tzinfo=timezone.utc)
    assert otif_from_shipments([]) is None
    # без срока — on-time
    assert otif_from_shipments([(t0, None)]) == 1.0
    # 2 on-time (включая без срока), 1 late → 2/3
    assert otif_from_shipments([(t0, deadline), (late, deadline), (t0, None)]) == 0.6667


def test_dock_to_stock_and_order_cycle() -> None:
    start = datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc)
    end = datetime(2026, 3, 1, 14, 0, tzinfo=timezone.utc)
    assert dock_to_stock_hours(start, end) == 6.0
    assert dock_to_stock_hours(end, start) is None
    assert order_cycle_hours(start, end) == 6.0
    assert order_cycle_hours(start, start) == 0.0


def test_productivity_and_dock_utilization() -> None:
    assert productivity_rate(10, 2.0) == 5.0
    assert productivity_rate(0, 2.0) == 0.0
    assert productivity_rate(5, 0) is None
    # 4 касания × 1ч / (2 двери × 8ч) = 4/16 = 0.25
    assert dock_utilization(4, 2, 8.0) == 0.25
    assert dock_utilization(100, 1, 1.0) == 1.0
    assert dock_utilization(1, 0, 8.0) is None


def test_dead_stock_and_mean_ratio() -> None:
    assert dead_stock_ratio(100, 25) == 0.25
    assert dead_stock_ratio(0, 1) is None
    assert mean([1.0, 3.0, 5.0]) == 3.0
    assert mean([]) is None
    assert ratio(3, 4) == 0.75


def test_downtime_and_plan_fact_helpers() -> None:
    start = datetime(2026, 4, 1, 10, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=3)
    assert work_order_downtime_hours(start, end) == 3.0
    assert work_order_downtime_hours(None, None, created_at=start, updated_at=end) == 3.0
    assert work_order_downtime_hours(end, start) is None
    assert plan_fact_ratio(10.0, 5.0) == 2.0


def test_warehouse_kpi_csv_contains_metrics() -> None:
    snap = WarehouseKpiSnapshot(
        from_date="2026-01-01",
        to_date="2026-01-31",
        stock_accuracy=0.91,
        otif=0.8,
    )
    csv = warehouse_kpi_csv(snap)
    assert "stock_accuracy,0.91" in csv
    assert "otif,0.8" in csv
    assert "metric,value" in csv


def test_otif_naive_datetimes_comparable() -> None:
    """Naive UTC и aware не должны ломать сравнение."""
    shipped = datetime(2026, 2, 1, 10, 0)  # naive
    deadline = datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc)
    assert otif_from_shipments([(shipped, deadline)]) == 1.0
    late = datetime(2026, 2, 1, 15, 0) + timedelta(hours=0)
    assert otif_from_shipments([(late, deadline)]) == 0.0

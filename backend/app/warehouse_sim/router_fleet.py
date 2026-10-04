"""Парк устройств: CRUD, smart-camera, maintenance, задачи/события устройства."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.audit import get_client_ip, log_audit
from app.warehouse_sim.device_maintenance import (
    create_maintenance,
    get_maintenance,
    list_maintenance,
    maintenance_summaries,
    maintenance_summary,
    patch_maintenance,
    serialize_maintenance,
)
from app.warehouse_sim.equipment_catalog import equipment_catalog
from app.warehouse_sim.fleet import (
    SUPPORTED_KINDS,
    archive_fleet_device,
    create_fleet_device,
    get_device_row,
    list_config_devices,
    patch_fleet_device,
    serialize_fleet_device,
)
from app.warehouse_sim.router_common import (
    CurrentUser,
    SessionDep,
    SimAdmin,
    _rebind_smart_cameras,
    _runtime_by_code,
)
from app.warehouse_sim.runtime import get_runtime, query_event_log
from app.warehouse_sim.schemas import (
    DeviceFleetCreate,
    DeviceFleetPatch,
    DeviceMaintenanceCreate,
    DeviceMaintenancePatch,
    SmartCameraAssignBody,
)

router = APIRouter()


@router.get("/fleet")
def list_fleet(
    session: SessionDep,
    _user: CurrentUser,
    include_archived: bool = Query(default=False),
    category: str | None = Query(default=None),
    kind: str | None = Query(default=None),
) -> dict[str, Any]:
    rows = list_config_devices(session, include_archived=include_archived)
    runtime = _runtime_by_code()
    summaries = maintenance_summaries(session, [row.id for row in rows])
    from app.warehouse_sim.bracelets import active_assignments_map
    from app.warehouse_sim.smart_cameras import (
        active_assignments_by_camera,
        active_assignments_by_host,
    )

    bracelet_map = active_assignments_map(session, device_ids=[row.id for row in rows])
    assignments: dict[Any, Any] = dict(bracelet_map)
    assignments["__smart_cameras__"] = {
        "by_host": active_assignments_by_host(
            session, host_ids=[row.id for row in rows]
        ),
        "by_camera": active_assignments_by_camera(
            session, camera_ids=[row.id for row in rows]
        ),
    }
    data = [
        serialize_fleet_device(
            row,
            runtime.get(row.code),
            maintenance=summaries.get(row.id),
            session=session,
            assignments=assignments,
        )
        for row in rows
    ]
    if category and category != "all":
        data = [row for row in data if row["category"] == category]
    if kind:
        data = [row for row in data if row["kind"] == kind]
    catalog = equipment_catalog()
    return {
        "data": data,
        "count": len(data),
        "kinds": list(SUPPORTED_KINDS),
        **catalog,
    }


@router.get("/fleet/smart-cameras/available")
def list_available_smart_cameras(
    session: SessionDep, _user: CurrentUser
) -> dict[str, Any]:
    from app.warehouse_sim.smart_cameras import list_available_cameras

    data = list_available_cameras(session)
    return {"data": data, "count": len(data)}


@router.post("/fleet")
def create_fleet(
    session: SessionDep, request: Request, user: SimAdmin, body: DeviceFleetCreate
) -> dict[str, Any]:
    row = create_fleet_device(session, body.model_dump())
    get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.create",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"code": row.code, "name": row.name},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_fleet_device(
        row, _runtime_by_code().get(row.code), session=session
    )


@router.get("/fleet/{device_id}")
def read_fleet_device(
    session: SessionDep, _user: CurrentUser, device_id: uuid.UUID
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    return serialize_fleet_device(
        row,
        _runtime_by_code().get(row.code),
        maintenance=maintenance_summary(session, row.id),
        session=session,
    )


@router.patch("/fleet/{device_id}")
def patch_fleet(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    body: DeviceFleetPatch,
) -> dict[str, Any]:
    patch = body.model_dump(exclude_unset=True)
    row = get_device_row(session, device_id)
    previous_code = row.code
    runtime_device = _runtime_by_code().get(previous_code)
    rt = get_runtime()
    if patch.get("inMaintenance") and runtime_device and runtime_device.get("taskId"):
        raise HTTPException(
            status_code=409,
            detail="Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
        )
    if rt.state == "RUNNING" and runtime_device and runtime_device.get("taskId"):
        if "kind" in patch or "code" in patch:
            raise HTTPException(
                status_code=409,
                detail="Тип и код нельзя менять, пока устройство выполняет задание",
            )
    deferred: list[str] = []
    if rt.state == "RUNNING":
        if "speed" in patch:
            deferred.append("speed")
        if "kind" in patch:
            deferred.append("kind")
    row = patch_fleet_device(session, device_id, patch)
    rt.sync_fleet_device(row, previous_code=previous_code)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.update",
        resource_type="wsim_device",
        resource_id=row.id,
        details={k: patch[k] for k in patch if k != "configuration"}
        | (
            {"configuration": patch["configuration"]}
            if "configuration" in patch
            else {}
        ),
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_fleet_device(
        row,
        _runtime_by_code().get(row.code) or _runtime_by_code().get(previous_code),
        maintenance=maintenance_summary(session, row.id),
        deferred=deferred,
        session=session,
    )


@router.delete("/fleet/{device_id}")
def delete_fleet_device(
    session: SessionDep, request: Request, user: SimAdmin, device_id: uuid.UUID
) -> dict[str, Any]:
    row = archive_fleet_device(session, device_id)
    get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.archive",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"code": row.code},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_fleet_device(
        row, _runtime_by_code().get(row.code), session=session
    )


@router.get("/fleet/{device_id}/smart-camera")
def read_fleet_smart_camera(
    session: SessionDep, _user: CurrentUser, device_id: uuid.UUID
) -> dict[str, Any]:
    from app.warehouse_sim.smart_cameras import (
        camera_payload,
        host_payload,
        is_camera_host,
        is_smart_camera,
    )

    row = get_device_row(session, device_id)
    runtime = _runtime_by_code().get(row.code)
    if is_camera_host(row):
        return {"smart_camera": camera_payload(session, host=row, runtime=runtime)}
    if is_smart_camera(row):
        return {"mounted_on": host_payload(session, row), "smart_camera": None}
    raise HTTPException(
        status_code=400, detail="Устройство не поддерживает умную камеру"
    )


@router.post("/fleet/{device_id}/smart-camera/assign")
def assign_fleet_smart_camera(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    body: SmartCameraAssignBody,
) -> dict[str, Any]:
    from app.warehouse_sim.smart_cameras import assign_smart_camera, camera_payload

    host = get_device_row(session, device_id)
    assignment = assign_smart_camera(
        session, host=host, camera_id=body.camera_id, user_id=user.id
    )
    camera = get_device_row(session, assignment.camera_device_id)
    log_audit(
        session,
        user_id=user.id,
        action="SMART_CAMERA_ASSIGNED",
        resource_type="wsim_device",
        resource_id=host.id,
        details={
            "equipment_id": str(host.id),
            "equipment_code": host.code,
            "camera_id": str(camera.id),
            "camera_code": camera.code,
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    _rebind_smart_cameras()
    return {
        "smart_camera": camera_payload(
            session,
            host=host,
            assignment=assignment,
            runtime=_runtime_by_code().get(host.code),
        )
    }


@router.post("/fleet/{device_id}/smart-camera/replace")
def replace_fleet_smart_camera(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    body: SmartCameraAssignBody,
) -> dict[str, Any]:
    from app.warehouse_sim.models import SimDevice
    from app.warehouse_sim.smart_cameras import (
        active_assignment_for_host,
        camera_payload,
        replace_smart_camera,
    )

    host = get_device_row(session, device_id)
    previous = active_assignment_for_host(session, host.id)
    previous_id = str(previous.camera_device_id) if previous else None
    previous_code = None
    if previous:
        prev_cam = session.get(SimDevice, previous.camera_device_id)
        previous_code = prev_cam.code if prev_cam else None
    assignment = replace_smart_camera(
        session, host=host, new_camera_id=body.camera_id, user_id=user.id
    )
    camera = get_device_row(session, assignment.camera_device_id)
    log_audit(
        session,
        user_id=user.id,
        action="SMART_CAMERA_REPLACED",
        resource_type="wsim_device",
        resource_id=host.id,
        details={
            "equipment_id": str(host.id),
            "equipment_code": host.code,
            "camera_id": str(camera.id),
            "camera_code": camera.code,
            "previous_camera_id": previous_id,
            "previous_camera_code": previous_code,
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    _rebind_smart_cameras()
    return {
        "smart_camera": camera_payload(
            session,
            host=host,
            assignment=assignment,
            runtime=_runtime_by_code().get(host.code),
        )
    }


@router.post("/fleet/{device_id}/smart-camera/unassign")
def unassign_fleet_smart_camera(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
) -> dict[str, Any]:
    from app.warehouse_sim.models import SimDevice
    from app.warehouse_sim.smart_cameras import camera_payload, unassign_smart_camera

    host = get_device_row(session, device_id)
    assignment = unassign_smart_camera(session, host=host)
    camera_id = str(assignment.camera_device_id) if assignment else None
    camera_code = None
    if assignment:
        cam = session.get(SimDevice, assignment.camera_device_id)
        camera_code = cam.code if cam else None
    log_audit(
        session,
        user_id=user.id,
        action="SMART_CAMERA_UNASSIGNED",
        resource_type="wsim_device",
        resource_id=host.id,
        details={
            "equipment_id": str(host.id),
            "equipment_code": host.code,
            "camera_id": camera_id,
            "camera_code": camera_code,
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    _rebind_smart_cameras()
    return {
        "smart_camera": camera_payload(
            session, host=host, runtime=_runtime_by_code().get(host.code)
        )
    }


@router.get("/fleet/{device_id}/tasks")
def list_fleet_device_tasks(
    _user: CurrentUser, device_id: uuid.UUID, session: SessionDep
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    tasks = get_runtime().view_tasks(device_id=row.code)["data"]
    return {"data": tasks[-40:], "count": len(tasks)}


@router.get("/fleet/{device_id}/events")
def list_fleet_device_events(
    session: SessionDep,
    _user: CurrentUser,
    device_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    return query_event_log(
        session,
        get_runtime(),
        device_id=row.code,
        skip=skip,
        limit=limit,
    )


@router.get("/fleet/{device_id}/maintenance")
def list_fleet_device_maintenance(
    session: SessionDep, _user: CurrentUser, device_id: uuid.UUID
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    items = [serialize_maintenance(item) for item in list_maintenance(session, row.id)]
    return {
        "data": items,
        "count": len(items),
        "summary": maintenance_summary(session, row.id),
    }


@router.post("/fleet/{device_id}/maintenance")
def create_fleet_device_maintenance(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    body: DeviceMaintenanceCreate,
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    payload = body.model_dump()
    if payload.get("status") == "in_progress":
        runtime_device = _runtime_by_code().get(row.code)
        if runtime_device and runtime_device.get("taskId"):
            raise HTTPException(
                status_code=409,
                detail="Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
            )
    record = create_maintenance(session, row, payload)
    if payload.get("status") == "in_progress":
        row = patch_fleet_device(session, row.id, {"inMaintenance": True})
        get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.maintenance.create",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"maintenance_id": str(record.id), "title": record.title},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_maintenance(record)


@router.patch("/fleet/{device_id}/maintenance/{record_id}")
def patch_fleet_device_maintenance(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    record_id: uuid.UUID,
    body: DeviceMaintenancePatch,
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    record = get_maintenance(session, record_id)
    if record.device_id != row.id:
        raise HTTPException(status_code=404, detail="Запись ТО не найдена")
    patch = body.model_dump(exclude_unset=True)
    if patch.get("status") == "in_progress":
        runtime_device = _runtime_by_code().get(row.code)
        if runtime_device and runtime_device.get("taskId"):
            raise HTTPException(
                status_code=409,
                detail="Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
            )
    record = patch_maintenance(session, record_id, patch)
    if record.status == "in_progress":
        row = patch_fleet_device(session, row.id, {"inMaintenance": True})
        get_runtime().sync_fleet_device(row)
    elif record.status in ("completed", "cancelled"):
        open_items = [
            item
            for item in list_maintenance(session, row.id)
            if item.status == "in_progress"
        ]
        if not open_items:
            row = patch_fleet_device(session, row.id, {"inMaintenance": False})
            get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.maintenance.update",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"maintenance_id": str(record.id), "status": record.status},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_maintenance(record)

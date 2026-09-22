"""Pydantic-схемы команд Device Server."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.warehouse_sim.models import SIM_SPEEDS


class SimControlBody(BaseModel):
    action: Literal["start", "pause", "stop", "reset"]
    config: dict[str, Any] | None = None


class SimSpeedBody(BaseModel):
    speed: float

    def validated_speed(self) -> float:
        if self.speed not in SIM_SPEEDS:
            raise ValueError("speed must be one of 0.5, 1, 2, 5, 10, 50")
        return float(self.speed)


class SimConfigPatch(BaseModel):
    truckArrivalsPerHour: float | None = Field(default=None, ge=0, le=80)
    ordersPerHour: float | None = Field(default=None, ge=0, le=120)
    faultRatePerHour: float | None = Field(default=None, ge=0, le=20)
    scanErrorRate: float | None = Field(default=None, ge=0, le=1)
    jamRatePerHour: float | None = Field(default=None, ge=0, le=20)
    batteryDrainPerMin: float | None = Field(default=None, ge=0, le=10)
    autoRepair: bool | None = None
    forklifts: int | None = Field(default=None, ge=1, le=20)
    agvs: int | None = Field(default=None, ge=1, le=20)
    amrs: int | None = Field(default=None, ge=1, le=20)


class SimCommandBody(BaseModel):
    type: str
    deviceId: str | None = None
    urgent: bool | None = None


class DeviceCommandBody(BaseModel):
    command: Literal["START", "STOP", "RESET", "MOVE", "CHARGE", "LOAD", "UNLOAD", "FAIL", "RECOVER"]
    payload: dict[str, Any] | None = None


class ManualEventBody(BaseModel):
    event_type: str = Field(min_length=1, max_length=48)
    device_id: str | None = None
    message: str | None = Field(default=None, max_length=512)


class FastForwardBody(BaseModel):
    seconds: float = Field(gt=0, le=3600)


class ApplyScenarioBody(BaseModel):
    code: str = Field(min_length=1, max_length=48)


class DeviceFleetCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=32)
    name: str | None = Field(default=None, max_length=64)
    code: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    enabled: bool = True
    speed: float | None = Field(default=None, ge=0, le=20)
    battery: float | None = Field(default=None, ge=0, le=100)
    home: dict[str, Any] | None = None
    configuration: dict[str, Any] | None = None


class DeviceFleetPatch(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    code: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    kind: str | None = Field(default=None, max_length=32)
    enabled: bool | None = None
    archived: bool | None = None
    speed: float | None = Field(default=None, ge=0, le=20)
    battery: float | None = Field(default=None, ge=0, le=100)
    configuration: dict[str, Any] | None = None
    inMaintenance: bool | None = None
    engineHours: int | None = Field(default=None, ge=0)


class DeviceMaintenanceCreate(BaseModel):
    type: str = Field(min_length=1, max_length=24)
    status: str | None = Field(default=None, max_length=24)
    title: str = Field(min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4096)
    priority: str | None = Field(default=None, max_length=16)
    scheduled_at: str | None = None
    performed_by: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=2048)


class CameraControlBody(BaseModel):
    action: Literal["start", "stop", "enable", "disable", "threshold", "seen", "lost"]
    confidence_threshold: float | None = Field(default=None, ge=0, le=1)
    class_name: str | None = Field(default=None, max_length=32)
    entity_id: str | None = Field(default=None, max_length=64)


class DeviceMaintenancePatch(BaseModel):
    type: str | None = Field(default=None, max_length=24)
    status: str | None = Field(default=None, max_length=24)
    title: str | None = Field(default=None, max_length=256)
    description: str | None = Field(default=None, max_length=4096)
    priority: str | None = Field(default=None, max_length=16)
    scheduled_at: str | None = None
    performed_by: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=2048)


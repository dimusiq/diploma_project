/**
 * Позиции техники из twin SSE (канал equipment_positions).
 */
import { useEffect, useState } from "react"
import {
  subscribeTwinStreamMessages,
  type TwinStreamEnvelope,
} from "@/lib/twinRealtimeBus.ts"

export type LiveEquipmentPose = {
  equipmentId: string
  xNorm?: number
  zNorm?: number
  x?: number
  z?: number
  y?: number
  recordedAt?: string
  externalVehicleId?: string
}

function poseFromRecord(
  pose: Record<string, unknown> | undefined,
): Pick<LiveEquipmentPose, "xNorm" | "zNorm" | "x" | "z" | "y"> {
  if (!pose) return {}
  const xn = pose.x_norm
  const zn = pose.z_norm
  const x = pose.x
  const z = pose.z
  const y = pose.y
  return {
    ...(typeof xn === "number" ? { xNorm: xn } : {}),
    ...(typeof zn === "number" ? { zNorm: zn } : {}),
    ...(typeof x === "number" ? { x } : {}),
    ...(typeof z === "number" ? { z } : {}),
    ...(typeof y === "number" ? { y } : {}),
  }
}

function mergeEnvelope(
  prev: Map<string, LiveEquipmentPose>,
  msg: TwinStreamEnvelope,
): Map<string, LiveEquipmentPose> {
  const next = new Map(prev)
  const payload = msg.payload
  if (!payload) return next

  if (msg.type === "positions_batch") {
    const batch = payload.positions as
      | Record<string, Record<string, unknown>>
      | undefined
    if (batch && typeof batch === "object") {
      for (const [id, row] of Object.entries(batch)) {
        const pose = poseFromRecord(row.pose as Record<string, unknown>)
        next.set(id, {
          equipmentId: String(row.equipment_id ?? id),
          ...pose,
          recordedAt:
            typeof row.recorded_at === "string" ? row.recorded_at : undefined,
        })
      }
    }
    return next
  }

  if (msg.type === "external_vehicle_pose") {
    const extId = payload.external_vehicle_id
    const key =
      typeof extId === "string" && extId.length > 0
        ? `ext:${extId}`
        : `ext:${String(payload.vehicle_position_id ?? Date.now())}`
    const pose = poseFromRecord(payload.pose as Record<string, unknown>)
    next.set(key, {
      equipmentId: key,
      ...pose,
      externalVehicleId:
        typeof extId === "string" ? extId : undefined,
      recordedAt:
        typeof payload.recorded_at === "string"
          ? payload.recorded_at
          : undefined,
    })
  }

  return next
}

export function useEquipmentPositionsLive(): Map<string, LiveEquipmentPose> {
  const [positions, setPositions] = useState<Map<string, LiveEquipmentPose>>(
    () => new Map(),
  )

  useEffect(() => {
    return subscribeTwinStreamMessages((msg) => {
      if (msg.channel !== "equipment_positions") return
      setPositions((prev) => mergeEnvelope(prev, msg))
    })
  }, [])

  return positions
}

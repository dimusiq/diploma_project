import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { request } from "@/lib/apiClient.ts"

export const SMART_CAMERA_QUERY_KEY = ["smartCamera"] as const

export function cameraStatusKey(equipmentId: string) {
  return [...SMART_CAMERA_QUERY_KEY, equipmentId, "status"] as const
}

export function cameraDetectionsKey(equipmentId: string) {
  return [...SMART_CAMERA_QUERY_KEY, equipmentId, "detections"] as const
}

export function cameraFrameKey(equipmentId: string, frameIndex: number) {
  return [...SMART_CAMERA_QUERY_KEY, equipmentId, "frame", frameIndex] as const
}

export type CameraDetection = {
  id: string
  camera_id: string
  equipment_id: string
  timestamp: string
  class_name: string
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
  track_id: string | null
  severity: string
  entity_type?: string
  entity_id?: string
  world_position?: { x: number; y: number; z: number }
}

export type CameraStatus = {
  installed: boolean
  equipment_id: string
  camera_id?: string
  enabled?: boolean
  online?: boolean
  source?: string
  model?: string
  fps?: number
  inference_ms?: number
  frame_index?: number
  detection_count?: number
  obstacle?: boolean
  description?: string
  status?: string
}

export type CameraFrame = {
  equipment_id: string
  camera_id: string
  width: number
  height: number
  frame_index: number
  mode?: string
  svg: string | null
  detections: CameraDetection[]
  description: string
}

const base = (equipmentId: string) =>
  `/api/v1/warehouse-sim/equipment/${encodeURIComponent(equipmentId)}/camera`

export function fetchCameraStatus(equipmentId: string) {
  return request<CameraStatus>(base(equipmentId))
}

export function fetchCameraDetections(equipmentId: string) {
  return request<{
    data: CameraDetection[]
    count: number
    description: string
    obstacle: boolean
  }>(`${base(equipmentId)}/detections`)
}

export function fetchCameraFrame(equipmentId: string) {
  return request<CameraFrame>(`${base(equipmentId)}/frame`)
}

export function controlCamera(
  equipmentId: string,
  action: "start" | "stop" | "enable" | "disable" | "threshold" | "seen" | "lost",
  confidenceThreshold?: number,
  className?: string,
  entityId?: string,
) {
  return request<CameraStatus>(`${base(equipmentId)}/control`, {
    method: "POST",
    body: {
      action,
      confidence_threshold: confidenceThreshold,
      class_name: className,
      entity_id: entityId,
    },
  })
}

export function useCameraFrame(equipmentId: string, frameIndex: number, enabled: boolean) {
  return useQuery({
    queryKey: cameraFrameKey(equipmentId, frameIndex),
    queryFn: () => fetchCameraFrame(equipmentId),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useCameraControl(equipmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (action: "start" | "stop") => controlCamera(equipmentId, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...SMART_CAMERA_QUERY_KEY, equipmentId] })
    },
  })
}

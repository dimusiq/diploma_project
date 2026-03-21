import { request } from "@/lib/apiClient.ts"

export interface WarehouseTask {
  id: string
  warehouse_id: string
  task_type: string
  status: string
  priority: number
  assigned_user_id: string | null
  handling_unit_id: string | null
  storage_bin_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface WarehouseTaskList {
  data: WarehouseTask[]
  count: number
}

export async function fetchWarehouseTasks(params?: {
  status?: string
  skip?: number
  limit?: number
}): Promise<WarehouseTaskList> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set("status", params.status)
  if (params?.skip != null) sp.set("skip", String(params.skip))
  if (params?.limit != null) sp.set("limit", String(params.limit))
  const q = sp.toString()
  return request<WarehouseTaskList>(
    `/api/v1/warehouse/tasks${q ? `?${q}` : ""}`,
  )
}

export async function patchWarehouseTask(
  taskId: string,
  body: {
    status?: string
    priority?: number
    assigned_user_id?: string | null
    payload?: Record<string, unknown> | null
  },
): Promise<WarehouseTask> {
  return request<WarehouseTask>(`/api/v1/warehouse/tasks/${taskId}`, {
    method: "PATCH",
    body,
  })
}

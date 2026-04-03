import { request } from "@/lib/apiClient.ts"

export interface MaintenanceTemplateChecklistItemPublic {
  id: string
  title: string
  sort_order: number
}

export interface MaintenanceTemplateSparePartRequirementPublic {
  id: string
  spare_part_id: string
  spare_part_title: string | null
  spare_part_sku: string | null
  quantity: number
}

export interface MaintenanceReglamentTemplatePublic {
  id: string
  equipment_type: string
  interval_hours: number | null
  created_at: string
  updated_at: string
}

export interface MaintenanceReglamentTemplateDetailPublic
  extends MaintenanceReglamentTemplatePublic {
  checklist_items: MaintenanceTemplateChecklistItemPublic[]
  spare_part_requirements: MaintenanceTemplateSparePartRequirementPublic[]
}

export interface MaintenanceTemplateChecklistItemCreate {
  title: string
  sort_order?: number | null
}

export interface MaintenanceTemplateSparePartRequirementCreate {
  spare_part_id: string
  quantity: number
}

export interface MaintenanceReglamentTemplateCreateBody {
  equipment_type: string
  interval_hours: number | null
  checklist_items: MaintenanceTemplateChecklistItemCreate[]
  spare_part_requirements: MaintenanceTemplateSparePartRequirementCreate[]
}

export interface MaintenanceReglamentTemplateListResponse {
  data: MaintenanceReglamentTemplatePublic[]
  count: number
}

const BASE = "/api/v1/maintenance-templates"

export const maintenanceTemplatesApi = {
  list: () => request<MaintenanceReglamentTemplateListResponse>(`${BASE}`),

  get: (id: string) =>
    request<MaintenanceReglamentTemplateDetailPublic>(`${BASE}/${id}`),

  create: (body: MaintenanceReglamentTemplateCreateBody) =>
    request<MaintenanceReglamentTemplateDetailPublic>(`${BASE}`, {
      method: "POST",
      body,
    }),

  update: (id: string, body: MaintenanceReglamentTemplateCreateBody) =>
    request<MaintenanceReglamentTemplateDetailPublic>(`${BASE}/${id}`, {
      method: "PUT",
      body,
    }),

  delete: (id: string) =>
    request<{ message: string }>(`${BASE}/${id}`, { method: "DELETE" }),
}

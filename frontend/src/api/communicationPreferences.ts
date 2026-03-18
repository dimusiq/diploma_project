/**
 * API настроек уведомлений и отчётов (in-app/email) для текущего пользователя.
 */
import { request } from "@/lib/apiClient.ts"

export type CommunicationPreferenceKind = "notification" | "report"

export interface CommunicationPreferencePublic {
  id: string
  user_id: string
  kind: CommunicationPreferenceKind
  key: string
  in_app_enabled: boolean
  email_enabled: boolean
  created_at: string
  updated_at: string
}

export interface CommunicationPreferenceListResponse {
  data: CommunicationPreferencePublic[]
}

export interface CommunicationPreferenceUpsertBody {
  kind: CommunicationPreferenceKind
  key: string
  in_app_enabled: boolean
  email_enabled: boolean
}

export const communicationPreferencesApi = {
  listMine: () =>
    request<CommunicationPreferenceListResponse>(
      "/api/v1/users/me/communication-preferences",
    ),

  upsertMine: (body: CommunicationPreferenceUpsertBody) =>
    request<CommunicationPreferencePublic>(
      "/api/v1/users/me/communication-preferences",
      { method: "PUT", body },
    ),
}


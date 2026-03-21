import { request } from "@/lib/apiClient.ts"

export async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  const r = await request<{ flags: Record<string, boolean> }>(
    "/api/v1/integrations/feature-flags",
  )
  return r.flags
}

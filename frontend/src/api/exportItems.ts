/**
 * Экспорт товаров в CSV или XLSX.
 * Скачивает файл с учётом авторизации и текущих фильтров.
 */

import { fetchWithAuth } from "@/lib/apiClient.ts"

export interface ExportItemsParams {
  format: "csv" | "xlsx"
  status?: string
  search?: string
  category_id?: string
  created_at_from?: string
  created_at_to?: string
}

function buildQuery(params: ExportItemsParams): string {
  const q = new URLSearchParams()
  q.set("format", params.format)
  if (params.status) q.set("status", params.status)
  if (params.search) q.set("search", params.search)
  if (params.category_id) q.set("category_id", params.category_id)
  if (params.created_at_from) q.set("created_at_from", params.created_at_from)
  if (params.created_at_to) q.set("created_at_to", params.created_at_to)
  return q.toString()
}

/**
 * Скачать экспорт товаров (CSV или XLSX) по заданным фильтрам.
 */
export async function downloadItemsExport(
  params: ExportItemsParams,
): Promise<void> {
  const query = buildQuery(params)
  const res = await fetchWithAuth(`/api/v1/items/export?${query}`)
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition")
  const match = disposition?.match(/filename=(.+)/)
  const filename = match
    ? match[1].replace(/^["']|["']$/g, "")
    : `items_export.${params.format === "xlsx" ? "xlsx" : "csv"}`
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * Печать PDF: накладная и этикетка со штрихкодом.
 * Открывает PDF в новой вкладке (с учётом авторизации).
 */

import { request } from "@/lib/apiClient.ts"

/**
 * Открыть PDF этикетки товара в новой вкладке (со штрихкодом при наличии barcode).
 */
export async function openLabelPdf(itemId: string): Promise<void> {
  const blob = await request<Blob>(`/api/v1/items/${itemId}/label-pdf`, {
    responseType: "blob",
  })
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, "_blank")
  URL.revokeObjectURL(objectUrl)
}

/**
 * Открыть PDF накладной по списку товаров в новой вкладке.
 */
export async function openShippingNotePdf(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) throw new Error("Выберите хотя бы один товар")
  const blob = await request<Blob>("/api/v1/items/shipping-note-pdf", {
    method: "POST",
    body: { item_ids: itemIds },
    responseType: "blob",
  })
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, "_blank")
  URL.revokeObjectURL(objectUrl)
}

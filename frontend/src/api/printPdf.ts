/**
 * Печать PDF: накладная и этикетка со штрихкодом.
 * Открывает PDF в новой вкладке (с учётом авторизации).
 */

import { OpenAPI } from "@/client/index.ts"

function getApiBase(): string {
  return OpenAPI.BASE || "http://localhost:8000"
}

async function getToken(): Promise<string> {
  return localStorage.getItem("access_token") || ""
}

/**
 * Открыть PDF этикетки товара в новой вкладке (со штрихкодом при наличии barcode).
 */
export async function openLabelPdf(itemId: string): Promise<void> {
  const token = await getToken()
  const base = getApiBase()
  const url = `${base}/api/v1/items/${itemId}/label-pdf`
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    if (res.status === 404) {
      let msg = "Товар не найден или нет доступа"
      try {
        const body = await res.json()
        if (body?.detail)
          msg = typeof body.detail === "string" ? body.detail : msg
      } catch {
        // не JSON — оставляем msg по умолчанию
      }
      throw new Error(msg)
    }
    throw new Error(`Ошибка: ${res.status}`)
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, "_blank")
  URL.revokeObjectURL(objectUrl)
}

/**
 * Открыть PDF накладной по списку товаров в новой вкладке.
 */
export async function openShippingNotePdf(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) throw new Error("Выберите хотя бы один товар")
  const token = await getToken()
  const base = getApiBase()
  const url = `${base}/api/v1/items/shipping-note-pdf`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ item_ids: itemIds }),
  })
  if (!res.ok) {
    if (res.status === 404) {
      let msg = "Один из товаров не найден или нет доступа"
      try {
        const body = await res.json()
        if (body?.detail)
          msg = typeof body.detail === "string" ? body.detail : msg
      } catch {
        // ignore
      }
      throw new Error(msg)
    }
    throw new Error(`Ошибка: ${res.status}`)
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, "_blank")
  URL.revokeObjectURL(objectUrl)
}

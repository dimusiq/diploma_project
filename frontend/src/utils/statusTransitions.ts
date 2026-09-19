/**
 * Допустимые переходы статусов (совпадают с бэкендом):
 * incoming → warehouse → shipment → shipped
 */
import { getItemStatusLabel, ITEM_STATUS_LABELS } from "@/lib/statusLabels.ts"

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  incoming: ["warehouse"],
  warehouse: ["shipment"],
  shipment: ["shipped"],
}

export type ItemStatus = "incoming" | "warehouse" | "shipment" | "shipped"

export const STATUS_LABELS = ITEM_STATUS_LABELS

export function getAllowedNextStatuses(currentStatus: string): string[] {
  return ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? []
}

export function getStatusLabel(status: string): string {
  return getItemStatusLabel(status)
}

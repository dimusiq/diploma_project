/**
 * Допустимые переходы статусов (совпадают с бэкендом):
 * incoming → warehouse → shipment → shipped
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  incoming: ['warehouse'],
  warehouse: ['shipment'],
  shipment: ['shipped'],
};

export type ItemStatus = 'incoming' | 'warehouse' | 'shipment' | 'shipped';

export const STATUS_LABELS: Record<string, string> = {
  incoming: 'Поступления',
  warehouse: 'Склад',
  shipment: 'Отгрузка',
  shipped: 'Отгружено',
};

export function getAllowedNextStatuses(currentStatus: string): string[] {
  return ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

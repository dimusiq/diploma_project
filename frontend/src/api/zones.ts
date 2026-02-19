/**
 * API справочника зон склада (управление в админке).
 */

import { OpenAPI } from '@/client';

const getBase = () => OpenAPI.BASE || 'http://localhost:8000';
const getToken = () => localStorage.getItem('access_token') || '';

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getToken();
  const url = `${getBase()}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = err.detail || (Array.isArray(err.detail) ? err.detail.map((e: { msg: string }) => e.msg).join(', ') : res.statusText);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ZonePublic {
  id: string;
  name: string;
}

export interface ZoneCreate {
  name: string;
}

export interface ZoneUpdate {
  name?: string;
}

export const zonesApi = {
  list: () => request<ZonePublic[]>('/api/v1/zones/'),
  get: (id: string) => request<ZonePublic>(`/api/v1/zones/${id}`),
  create: (body: ZoneCreate) =>
    request<ZonePublic>('/api/v1/zones/', { method: 'POST', body }),
  update: (id: string, body: ZoneUpdate) =>
    request<ZonePublic>(`/api/v1/zones/${id}`, { method: 'PUT', body }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/v1/zones/${id}`, { method: 'DELETE' }),
};

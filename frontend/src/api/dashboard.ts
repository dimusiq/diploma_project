/**
 * Запрос трендов дашборда: поступления и отгрузки по дням/неделям.
 */

import { OpenAPI } from '@/client';

function getApiBase(): string {
  return OpenAPI.BASE || 'http://localhost:8000';
}

async function getToken(): Promise<string> {
  return localStorage.getItem('access_token') || '';
}

export interface DashboardTrendsParams {
  from?: string; // YYYY-MM-DD
  to?: string;
  group_by?: 'day' | 'week';
}

export interface TrendPoint {
  period: string;
  count: number;
}

export interface DashboardTrendsResponse {
  from: string;
  to: string;
  group_by: string;
  incoming: TrendPoint[];
  shipped: TrendPoint[];
}

export async function getDashboardTrends(
  params: DashboardTrendsParams = {}
): Promise<DashboardTrendsResponse> {
  const token = await getToken();
  const base = getApiBase();
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.group_by) q.set('group_by', params.group_by);
  const url = `${base}/api/v1/dashboard/trends?${q.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Ошибка: ${res.status}`);
  }
  return res.json() as Promise<DashboardTrendsResponse>;
}

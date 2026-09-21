import { apiRequest } from '@/services/api';
import type { DashboardResponse } from '@/types/dashboard';

/**
 * GET /api/dashboard
 *
 * Um único endpoint entrega cards, gráficos, alertas e atividade recente —
 * todos calculados no backend, dentro da mesma transação. O frontend não faz
 * nenhuma conta: ele desenha o que recebe.
 */
export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/dashboard', signal ? { signal } : {});
}

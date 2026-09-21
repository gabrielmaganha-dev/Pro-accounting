import { useQuery } from '@tanstack/react-query';

import { fetchDashboard } from '@/services/dashboard.service';
import type { DashboardResponse } from '@/types/dashboard';

export const dashboardQueryKey = ['dashboard'] as const;

/**
 * Dados do painel.
 *
 * `staleTime` de 60s: são números de gestão, não cotação de bolsa. Recarregar
 * a cada foco de janela geraria uma consulta pesada de agregação por nada.
 *
 * O `signal` do TanStack Query é repassado ao fetch para que, se o usuário
 * sair da tela no meio do carregamento, a requisição seja cancelada em vez de
 * ocupar conexão do pool do banco até terminar.
 */
export function useDashboard() {
  return useQuery<DashboardResponse>({
    queryKey: dashboardQueryKey,
    queryFn: ({ signal }) => fetchDashboard(signal),
    staleTime: 60_000,
  });
}

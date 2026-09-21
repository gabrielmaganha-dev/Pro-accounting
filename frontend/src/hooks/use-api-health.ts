import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/services/auth.service';
import type { HealthResponse } from '@/types/api';

/**
 * Estado da API, exibido no topo da aplicação.
 *
 * Serve a um propósito concreto na Etapa 1: é a prova visível de que o
 * frontend alcança o backend e de que o backend alcança o PostgreSQL. Quando
 * algo não estiver no ar, o usuário vê onde, em vez de encontrar um formulário
 * de login que falha sem explicação.
 */
export function useApiHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    // Revalida sozinho: se o backend cair enquanto a tela está aberta, o
    // indicador reflete isso em até 30 segundos.
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/services/api';
import {
  downloadFinanceExport,
  getFinanceEntries,
  getFinanceOverview,
} from '@/services/finance.service';
import type { ExportFormat, FinanceFilters } from '@/types/finance';

export const financeKeys = {
  all: ['finance'] as const,
  overview: (filters: FinanceFilters) => [...financeKeys.all, 'overview', filters] as const,
  entries: (filters: FinanceFilters) => [...financeKeys.all, 'entries', filters] as const,
};

export function useFinanceOverview(filters: FinanceFilters, enabled = true) {
  return useQuery({
    queryKey: financeKeys.overview(filters),
    queryFn: ({ signal }) => getFinanceOverview(filters, signal),
    enabled,
    // Mantém os números anteriores visíveis enquanto o novo período carrega,
    // em vez de piscar seis esqueletos a cada troca de filtro.
    placeholderData: (previous) => previous,
  });
}

export function useFinanceEntries(filters: FinanceFilters, enabled = true) {
  return useQuery({
    queryKey: financeKeys.entries(filters),
    queryFn: ({ signal }) => getFinanceEntries(filters, signal),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/**
 * Exportação.
 *
 * É uma mutação, não uma query: dispara um efeito (o download) e não tem
 * resultado para guardar em cache. Tratá-la como query faria o TanStack
 * reexecutá-la sozinho ao reobter o foco da janela — e o navegador baixaria o
 * arquivo de novo, do nada.
 */
export function useFinanceExport() {
  return useMutation({
    mutationFn: (filters: FinanceFilters & { format: ExportFormat }) =>
      downloadFinanceExport(filters),
    onSuccess: () => {
      toast.success('Exportação gerada. Confira os downloads do navegador.');
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível gerar a exportação.';

      // Formato ainda não disponível é aviso, não falha: o usuário pediu algo
      // que o sistema anuncia como previsto, e o toast vermelho sugeriria bug.
      if (error instanceof ApiError && error.code === 'NOT_IMPLEMENTED') {
        toast.info(message);
        return;
      }

      toast.error(message);
    },
  });
}

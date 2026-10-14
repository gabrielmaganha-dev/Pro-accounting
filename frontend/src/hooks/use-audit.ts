import { useQuery } from '@tanstack/react-query';

import { listAuditLogs } from '@/services/audit.service';
import type { AuditFilters } from '@/types/audit';

export const auditKeys = {
  all: ['audit'] as const,
  list: (filters: AuditFilters) => [...auditKeys.all, 'list', filters] as const,
};

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: ({ signal }) => listAuditLogs(filters, signal),
    placeholderData: (previous) => previous,
    // A trilha cresce a cada ação: revalidar ao voltar à aba mostra o que
    // aconteceu enquanto a pessoa estava em outra tela.
    refetchOnWindowFocus: true,
  });
}

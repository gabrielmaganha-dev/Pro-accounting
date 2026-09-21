import { useQuery } from '@tanstack/react-query';

import { getPayment, listPayments } from '@/services/payment.service';
import type { PaymentListFilters } from '@/types/payment';

/**
 * Fábrica de chaves de cache do histórico de pagamentos.
 *
 * Só consultas: um pagamento é criado e estornado pelas mutações do módulo de
 * faturas (`use-invoices.ts`), que já invalidam `['payments']` junto. Duplicar
 * as mutações aqui criaria dois caminhos para a mesma escrita, e um deles
 * acabaria esquecendo de invalidar alguma tela.
 */
export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (filters: PaymentListFilters) => [...paymentKeys.lists(), filters] as const,
  details: () => [...paymentKeys.all, 'detail'] as const,
  detail: (id: string) => [...paymentKeys.details(), id] as const,
};

export function usePayments(filters: PaymentListFilters) {
  return useQuery({
    queryKey: paymentKeys.list(filters),
    queryFn: ({ signal }) => listPayments(filters, signal),
    // Mantém a página anterior visível enquanto a próxima carrega, em vez de
    // piscar um esqueleto a cada clique na paginação.
    placeholderData: (previous) => previous,
  });
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: paymentKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getPayment(id as string, signal),
    enabled: Boolean(id),
  });
}

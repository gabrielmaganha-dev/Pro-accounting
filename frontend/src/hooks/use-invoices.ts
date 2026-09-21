import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { clientKeys } from '@/hooks/use-clients';
import { contractKeys } from '@/hooks/use-contracts';
import { paymentKeys } from '@/hooks/use-payments';
import { ApiError } from '@/services/api';
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  getInvoiceHistory,
  getNextInvoiceNumber,
  listInvoicePayments,
  listInvoices,
  registerPayment,
  removePayment,
  updateInvoice,
  updateInvoiceStatus,
} from '@/services/invoice.service';
import type { InvoiceListFilters, InvoicePayload, PaymentPayload } from '@/types/invoice';

/**
 * Fábrica de chaves de cache.
 *
 * Centralizar aqui evita o erro mais comum com TanStack Query: uma mutação
 * invalidar `['invoices']` enquanto a listagem foi registrada como
 * `['invoice-list']`. A tela então continuaria mostrando o registro antigo
 * depois de salvar, e o bug pareceria ser do backend.
 */
export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (filters: InvoiceListFilters) => [...invoiceKeys.lists(), filters] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  history: (id: string, page: number) => [...invoiceKeys.all, 'history', id, page] as const,
  payments: (id: string) => [...invoiceKeys.all, 'payments', id] as const,
  nextNumber: () => [...invoiceKeys.all, 'next-number'] as const,
};

export function useInvoices(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: ({ signal }) => listInvoices(filters, signal),
    // Mantém a página anterior visível enquanto a próxima carrega, em vez de
    // piscar um esqueleto a cada clique na paginação.
    placeholderData: (previous) => previous,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getInvoice(id as string, signal),
    enabled: Boolean(id),
  });
}

export function useInvoiceHistory(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: invoiceKeys.history(id ?? '', page),
    queryFn: ({ signal }) => getInvoiceHistory(id as string, page, 20, signal),
    enabled: Boolean(id),
  });
}

export function useInvoicePayments(id: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.payments(id ?? ''),
    queryFn: ({ signal }) => listInvoicePayments(id as string, signal),
    enabled: Boolean(id),
  });
}

/**
 * Sugestão de número para uma fatura nova.
 *
 * Sem cache entre montagens: o número sugerido envelhece no instante em que
 * outra pessoa emite uma fatura, e reaproveitar um valor guardado entregaria
 * um número já ocupado.
 */
export function useNextInvoiceNumber(enabled: boolean) {
  return useQuery({
    queryKey: invoiceKeys.nextNumber(),
    queryFn: ({ signal }) => getNextInvoiceNumber(signal),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Mensagem de erro pronta para o usuário, vinda da API quando possível. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Invalida tudo que uma fatura alterada afeta.
 *
 * Uma fatura aparece em seis lugares: a listagem, a própria ficha, a ficha do
 * CLIENTE (aba Faturas e resumo financeiro), a ficha do CONTRATO (idem), o
 * histórico de PAGAMENTOS e o painel. Sem invalidar os seis, registrar um
 * pagamento deixaria a ficha do cliente exibindo "Atrasado" e o histórico de
 * pagamentos sem o lançamento, até alguém recarregar a página.
 */
function useInvoiceInvalidation() {
  const queryClient = useQueryClient();

  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: clientKeys.all });
    void queryClient.invalidateQueries({ queryKey: contractKeys.all });
    void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    if (id) {
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: [...invoiceKeys.all, 'history', id] });
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.payments(id) });
    }
  };
}

export function useCreateInvoice() {
  const invalidate = useInvoiceInvalidation();

  return useMutation({
    mutationFn: (payload: InvoicePayload) => createInvoice(payload),
    onSuccess: (invoice) => {
      invalidate();
      toast.success(`Fatura "${invoice.number}" emitida.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível emitir a fatura.'));
    },
  });
}

export function useUpdateInvoice(id: string) {
  const invalidate = useInvoiceInvalidation();

  return useMutation({
    mutationFn: (payload: Partial<InvoicePayload>) => updateInvoice(id, payload),
    onSuccess: (invoice) => {
      invalidate(id);
      toast.success(`Fatura "${invoice.number}" atualizada.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar as alterações.'));
    },
  });
}

export function useUpdateInvoiceStatus() {
  const invalidate = useInvoiceInvalidation();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'CANCELLED' | 'PENDING' }) =>
      updateInvoiceStatus(id, status),
    onSuccess: (invoice) => {
      invalidate(invoice.id);
      toast.success(
        invoice.storedStatus === 'CANCELLED' ? 'Fatura cancelada.' : 'Fatura reaberta.',
      );
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível alterar a situação.'));
    },
  });
}

export function useRegisterPayment() {
  const invalidate = useInvoiceInvalidation();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PaymentPayload }) =>
      registerPayment(id, payload),
    onSuccess: (invoice) => {
      invalidate(invoice.id);
      toast.success(
        invoice.status === 'PAID'
          ? `Pagamento registrado. Fatura "${invoice.number}" quitada.`
          : 'Pagamento parcial registrado.',
      );
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível registrar o pagamento.'));
    },
  });
}

export function useRemovePayment() {
  const invalidate = useInvoiceInvalidation();

  return useMutation({
    mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) =>
      removePayment(id, paymentId),
    onSuccess: (invoice) => {
      invalidate(invoice.id);
      toast.success('Pagamento estornado.');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível estornar o pagamento.'));
    },
  });
}

export function useDeleteInvoice() {
  const invalidate = useInvoiceInvalidation();

  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      invalidate();
      toast.success('Fatura excluída.');
    },
    onError: (error) => {
      // A recusa mais comum aqui é 409 "existem pagamentos", e a mensagem da
      // API já explica o motivo e sugere cancelar.
      toast.error(errorMessage(error, 'Não foi possível excluir a fatura.'));
    },
  });
}

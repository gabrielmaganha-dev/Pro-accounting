import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/services/api';
import {
  createClient,
  deleteClient,
  getClient,
  getClientHistory,
  listClientInvoices,
  listClients,
  updateClient,
  updateClientStatus,
} from '@/services/client.service';
import type { ClientListFilters, ClientPayload, ClientStatus } from '@/types/client';
import type { EffectiveInvoiceStatus } from '@/types/dashboard';

/**
 * Fábrica de chaves de cache.
 *
 * Centralizar aqui evita o erro mais comum com TanStack Query: uma mutação
 * invalidar `['clients']` enquanto a listagem foi registrada como
 * `['client-list']`. A tela então continuaria mostrando o registro antigo
 * depois de salvar, e o bug pareceria ser do backend.
 */
export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: ClientListFilters) => [...clientKeys.lists(), filters] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  history: (id: string, page: number) => [...clientKeys.all, 'history', id, page] as const,
  invoices: (id: string, status: string | undefined, page: number) =>
    [...clientKeys.all, 'invoices', id, status ?? 'all', page] as const,
};

export function useClients(filters: ClientListFilters) {
  return useQuery({
    queryKey: clientKeys.list(filters),
    queryFn: ({ signal }) => listClients(filters, signal),
    // Mantém a página anterior visível enquanto a próxima carrega, em vez de
    // piscar um esqueleto a cada clique na paginação.
    placeholderData: (previous) => previous,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: clientKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getClient(id as string, signal),
    enabled: Boolean(id),
  });
}

export function useClientHistory(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: clientKeys.history(id ?? '', page),
    queryFn: ({ signal }) => getClientHistory(id as string, page, 20, signal),
    enabled: Boolean(id),
  });
}

export function useClientInvoices(
  id: string | undefined,
  status: EffectiveInvoiceStatus | undefined,
  page = 1,
) {
  return useQuery({
    queryKey: clientKeys.invoices(id ?? '', status, page),
    queryFn: ({ signal }) => listClientInvoices(id as string, status, page, 20, signal),
    enabled: Boolean(id),
    // Mantém a página atual visível ao trocar de filtro ou de página, em vez
    // de piscar esqueleto a cada clique.
    placeholderData: (previous) => previous,
  });
}

/** Mensagem de erro pronta para o usuário, vinda da API quando possível. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ClientPayload) => createClient(payload),
    onSuccess: (client) => {
      void queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      // O painel conta clientes — sem isto, o card continuaria com o número
      // antigo até alguém recarregar a página.
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Cliente "${client.name}" cadastrado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível cadastrar o cliente.'));
    },
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<ClientPayload>) => updateClient(id, payload),
    onSuccess: (client) => {
      void queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) });
      // O histórico ganhou linhas novas com esta edição.
      void queryClient.invalidateQueries({ queryKey: [...clientKeys.all, 'history', id] });
      toast.success(`Cliente "${client.name}" atualizado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar as alterações.'));
    },
  });
}

export function useUpdateClientStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ClientStatus }) =>
      updateClientStatus(id, status),
    onSuccess: (client) => {
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(
        client.status === 'ACTIVE'
          ? `Cliente "${client.name}" reativado.`
          : `Cliente "${client.name}" inativado.`,
      );
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível alterar a situação.'));
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Cliente excluído.');
    },
    onError: (error) => {
      // A recusa mais comum aqui é 409 "existem contratos vinculados", e a
      // mensagem da API já explica o motivo e sugere inativar.
      toast.error(errorMessage(error, 'Não foi possível excluir o cliente.'));
    },
  });
}

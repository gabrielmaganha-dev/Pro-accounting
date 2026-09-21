import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/services/api';
import {
  createContract,
  deleteContract,
  getContract,
  getNextContractNumber,
  listContractInvoices,
  listContracts,
  renewContract,
  updateContract,
  updateContractStatus,
} from '@/services/contract.service';
import { clientKeys } from '@/hooks/use-clients';
import type {
  ContractListFilters,
  ContractPayload,
  ContractStatus,
  RenewContractPayload,
} from '@/types/contract';
import type { EffectiveInvoiceStatus } from '@/types/dashboard';

/**
 * Fábrica de chaves de cache.
 *
 * Centralizar aqui evita o erro mais comum com TanStack Query: uma mutação
 * invalidar `['contracts']` enquanto a listagem foi registrada como
 * `['contract-list']`. A tela então continuaria mostrando o registro antigo
 * depois de salvar, e o bug pareceria ser do backend.
 */
export const contractKeys = {
  all: ['contracts'] as const,
  lists: () => [...contractKeys.all, 'list'] as const,
  list: (filters: ContractListFilters) => [...contractKeys.lists(), filters] as const,
  details: () => [...contractKeys.all, 'detail'] as const,
  detail: (id: string) => [...contractKeys.details(), id] as const,
  invoices: (id: string, status: string | undefined, page: number) =>
    [...contractKeys.all, 'invoices', id, status ?? 'all', page] as const,
  nextNumber: () => [...contractKeys.all, 'next-number'] as const,
};

export function useContracts(filters: ContractListFilters) {
  return useQuery({
    queryKey: contractKeys.list(filters),
    queryFn: ({ signal }) => listContracts(filters, signal),
    // Mantém a página anterior visível enquanto a próxima carrega, em vez de
    // piscar um esqueleto a cada clique na paginação.
    placeholderData: (previous) => previous,
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: contractKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getContract(id as string, signal),
    enabled: Boolean(id),
  });
}

export function useContractInvoices(
  id: string | undefined,
  status: EffectiveInvoiceStatus | undefined,
  page = 1,
) {
  return useQuery({
    queryKey: contractKeys.invoices(id ?? '', status, page),
    queryFn: ({ signal }) => listContractInvoices(id as string, status, page, 20, signal),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });
}

/**
 * Sugestão de número para um contrato novo.
 *
 * `staleTime: 0` e sem cache entre montagens: o número sugerido envelhece no
 * instante em que outra pessoa cadastra um contrato, e reaproveitar um valor
 * guardado entregaria um número já ocupado.
 */
export function useNextContractNumber(enabled: boolean) {
  return useQuery({
    queryKey: contractKeys.nextNumber(),
    queryFn: ({ signal }) => getNextContractNumber(signal),
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
 * Invalida tudo que um contrato alterado afeta.
 *
 * Além das telas de contrato, a ficha do CLIENTE mostra a lista de contratos e
 * o painel conta contratos ativos. Sem invalidar os três, encerrar um contrato
 * deixaria a ficha do cliente exibindo "Ativo" até alguém recarregar a página.
 */
function useContractInvalidation() {
  const queryClient = useQueryClient();

  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: clientKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    if (id) {
      void queryClient.invalidateQueries({ queryKey: contractKeys.detail(id) });
    }
  };
}

export function useCreateContract() {
  const invalidate = useContractInvalidation();

  return useMutation({
    mutationFn: (payload: ContractPayload) => createContract(payload),
    onSuccess: (contract) => {
      invalidate();
      toast.success(`Contrato "${contract.number}" cadastrado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível cadastrar o contrato.'));
    },
  });
}

export function useUpdateContract(id: string) {
  const invalidate = useContractInvalidation();

  return useMutation({
    mutationFn: (payload: Partial<ContractPayload>) => updateContract(id, payload),
    onSuccess: (contract) => {
      invalidate(id);
      toast.success(`Contrato "${contract.number}" atualizado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar as alterações.'));
    },
  });
}

const STATUS_MESSAGES: Record<ContractStatus, string> = {
  ACTIVE: 'Contrato reativado.',
  PENDING: 'Contrato marcado como pendente.',
  RENEWAL: 'Contrato marcado como em renovação.',
  CLOSED: 'Contrato encerrado.',
  CANCELLED: 'Contrato cancelado.',
};

export function useUpdateContractStatus() {
  const invalidate = useContractInvalidation();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContractStatus }) =>
      updateContractStatus(id, status),
    onSuccess: (contract) => {
      invalidate(contract.id);
      toast.success(STATUS_MESSAGES[contract.status]);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível alterar a situação.'));
    },
  });
}

export function useRenewContract() {
  const invalidate = useContractInvalidation();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RenewContractPayload }) =>
      renewContract(id, payload),
    onSuccess: (contract) => {
      invalidate(contract.id);
      toast.success(`Contrato "${contract.number}" renovado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível renovar o contrato.'));
    },
  });
}

export function useDeleteContract() {
  const invalidate = useContractInvalidation();

  return useMutation({
    mutationFn: (id: string) => deleteContract(id),
    onSuccess: () => {
      invalidate();
      toast.success('Contrato excluído.');
    },
    onError: (error) => {
      // A recusa mais comum aqui é 409 "existem faturas vinculadas", e a
      // mensagem da API já explica o motivo e sugere encerrar.
      toast.error(errorMessage(error, 'Não foi possível excluir o contrato.'));
    },
  });
}

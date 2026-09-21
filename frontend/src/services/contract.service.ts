import { apiRequest } from '@/services/api';
import type { Paginated } from '@/types/client';
import type {
  Contract,
  ContractDetail,
  ContractInvoice,
  ContractListFilters,
  ContractPayload,
  ContractStatus,
  RenewContractPayload,
} from '@/types/contract';
import type { EffectiveInvoiceStatus } from '@/types/dashboard';

/**
 * Monta a query string ignorando filtros vazios.
 *
 * Enviar `?search=&status=` faria a API receber strings vazias onde espera
 * ausência — e o Zod recusaria um `status` vazio com erro de validação, num
 * filtro que o usuário apenas deixou em branco.
 */
function buildQuery(filters: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text.length === 0) continue;
    params.set(key, text);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listContracts(
  filters: ContractListFilters,
  signal?: AbortSignal,
): Promise<Paginated<Contract>> {
  return apiRequest<Paginated<Contract>>(
    `/contracts${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

export async function getContract(id: string, signal?: AbortSignal): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}`, signal ? { signal } : {});
}

export async function listContractInvoices(
  id: string,
  status: EffectiveInvoiceStatus | undefined,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<Paginated<ContractInvoice>> {
  const query = buildQuery({ page, pageSize, ...(status ? { status } : {}) });

  return apiRequest<Paginated<ContractInvoice>>(
    `/contracts/${id}/invoices${query}`,
    signal ? { signal } : {},
  );
}

/** Sugestão de número para o formulário. Não reserva nada — ver o serviço. */
export async function getNextContractNumber(signal?: AbortSignal): Promise<{ number: string }> {
  return apiRequest<{ number: string }>('/contracts/next-number', signal ? { signal } : {});
}

export async function createContract(payload: ContractPayload): Promise<Contract> {
  return apiRequest<Contract>('/contracts', { method: 'POST', body: payload });
}

export async function updateContract(
  id: string,
  payload: Partial<ContractPayload>,
): Promise<Contract> {
  return apiRequest<Contract>(`/contracts/${id}`, { method: 'PUT', body: payload });
}

export async function updateContractStatus(
  id: string,
  status: ContractStatus,
): Promise<Contract> {
  return apiRequest<Contract>(`/contracts/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export async function renewContract(
  id: string,
  payload: RenewContractPayload,
): Promise<Contract> {
  return apiRequest<Contract>(`/contracts/${id}/renew`, { method: 'POST', body: payload });
}

export async function deleteContract(id: string): Promise<void> {
  return apiRequest<void>(`/contracts/${id}`, { method: 'DELETE' });
}

import { apiRequest } from '@/services/api';
import type {
  Client,
  ClientDetail,
  ClientHistoryEntry,
  ClientInvoice,
  ClientListFilters,
  ClientPayload,
  ClientStatus,
  Paginated,
} from '@/types/client';
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

export async function listClients(
  filters: ClientListFilters,
  signal?: AbortSignal,
): Promise<Paginated<Client>> {
  return apiRequest<Paginated<Client>>(
    `/clients${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

export async function getClient(id: string, signal?: AbortSignal): Promise<ClientDetail> {
  return apiRequest<ClientDetail>(`/clients/${id}`, signal ? { signal } : {});
}

export async function getClientHistory(
  id: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Paginated<ClientHistoryEntry>> {
  return apiRequest<Paginated<ClientHistoryEntry>>(
    `/clients/${id}/history?page=${page}&pageSize=${pageSize}`,
    signal ? { signal } : {},
  );
}

export async function listClientInvoices(
  id: string,
  status: EffectiveInvoiceStatus | undefined,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<Paginated<ClientInvoice>> {
  const query = buildQuery({ page, pageSize, ...(status ? { status } : {}) });

  return apiRequest<Paginated<ClientInvoice>>(
    `/clients/${id}/invoices${query}`,
    signal ? { signal } : {},
  );
}

export async function createClient(payload: ClientPayload): Promise<Client> {
  return apiRequest<Client>('/clients', { method: 'POST', body: payload });
}

export async function updateClient(id: string, payload: Partial<ClientPayload>): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`, { method: 'PUT', body: payload });
}

export async function updateClientStatus(id: string, status: ClientStatus): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}/status`, { method: 'PATCH', body: { status } });
}

export async function deleteClient(id: string): Promise<void> {
  return apiRequest<void>(`/clients/${id}`, { method: 'DELETE' });
}

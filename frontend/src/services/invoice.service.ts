import { apiRequest } from '@/services/api';
import type { Paginated } from '@/types/client';
import type {
  Invoice,
  InvoiceHistoryEntry,
  InvoiceListFilters,
  InvoicePayload,
  Payment,
  PaymentPayload,
} from '@/types/invoice';

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

export async function listInvoices(
  filters: InvoiceListFilters,
  signal?: AbortSignal,
): Promise<Paginated<Invoice>> {
  return apiRequest<Paginated<Invoice>>(
    `/invoices${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

export async function getInvoice(id: string, signal?: AbortSignal): Promise<Invoice> {
  return apiRequest<Invoice>(`/invoices/${id}`, signal ? { signal } : {});
}

export async function getInvoiceHistory(
  id: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Paginated<InvoiceHistoryEntry>> {
  return apiRequest<Paginated<InvoiceHistoryEntry>>(
    `/invoices/${id}/history?page=${page}&pageSize=${pageSize}`,
    signal ? { signal } : {},
  );
}

export async function listInvoicePayments(
  id: string,
  signal?: AbortSignal,
): Promise<Payment[]> {
  return apiRequest<Payment[]>(`/invoices/${id}/payments`, signal ? { signal } : {});
}

/** Sugestão de número para o formulário. Não reserva nada — ver o serviço. */
export async function getNextInvoiceNumber(signal?: AbortSignal): Promise<{ number: string }> {
  return apiRequest<{ number: string }>('/invoices/next-number', signal ? { signal } : {});
}

export async function createInvoice(payload: InvoicePayload): Promise<Invoice> {
  return apiRequest<Invoice>('/invoices', { method: 'POST', body: payload });
}

export async function updateInvoice(
  id: string,
  payload: Partial<InvoicePayload>,
): Promise<Invoice> {
  return apiRequest<Invoice>(`/invoices/${id}`, { method: 'PUT', body: payload });
}

export async function updateInvoiceStatus(
  id: string,
  status: 'CANCELLED' | 'PENDING',
): Promise<Invoice> {
  return apiRequest<Invoice>(`/invoices/${id}/status`, { method: 'PATCH', body: { status } });
}

export async function registerPayment(id: string, payload: PaymentPayload): Promise<Invoice> {
  return apiRequest<Invoice>(`/invoices/${id}/payments`, { method: 'POST', body: payload });
}

export async function removePayment(id: string, paymentId: string): Promise<Invoice> {
  return apiRequest<Invoice>(`/invoices/${id}/payments/${paymentId}`, { method: 'DELETE' });
}

export async function deleteInvoice(id: string): Promise<void> {
  return apiRequest<void>(`/invoices/${id}`, { method: 'DELETE' });
}

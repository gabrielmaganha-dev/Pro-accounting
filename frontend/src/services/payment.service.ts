import { apiRequest } from '@/services/api';
import type {
  PaginatedPayments,
  PaymentDetail,
  PaymentListFilters,
} from '@/types/payment';

/**
 * Monta a query string ignorando filtros vazios.
 *
 * Enviar `?search=&paymentMethod=` faria a API receber strings vazias onde
 * espera ausência — e o Zod recusaria uma forma de pagamento vazia com erro de
 * validação, num filtro que o usuário apenas deixou em branco.
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

export async function listPayments(
  filters: PaymentListFilters,
  signal?: AbortSignal,
): Promise<PaginatedPayments> {
  return apiRequest<PaginatedPayments>(
    `/payments${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

export async function getPayment(id: string, signal?: AbortSignal): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(`/payments/${id}`, signal ? { signal } : {});
}

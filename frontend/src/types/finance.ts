import type { EffectiveInvoiceStatus, PaymentMethod } from '@/types/dashboard';

export type FinancePeriod =
  | 'today'
  | 'week'
  | 'month'
  | 'previous-month'
  | 'year'
  | 'custom';

/** Intervalo já resolvido pelo servidor, com rótulo pronto para exibir. */
export interface ResolvedPeriod {
  period: FinancePeriod;
  from: string;
  to: string;
  label: string;
  days: number;
}

/**
 * Cards do resumo.
 *
 * Dois grupos que a interface precisa distinguir, porque respondem a coisas
 * diferentes:
 *
 *  • `received` e `invoiced` seguem o PERÍODO selecionado;
 *  • `revenueThisMonth` e `revenueThisYear` são fixos, do mês e do ano corrente;
 *  • `pending` e `overdue` são a POSIÇÃO DE HOJE, não recortada por período —
 *    "atrasado" significa vencido até hoje, e recortar produziria outro número.
 *
 * Os rótulos da tela dizem isso, para ninguém somar maçãs com laranjas.
 */
export interface FinanceCards {
  revenueThisMonth: string;
  revenueThisYear: string;
  received: string;
  invoiced: string;
  pending: string;
  overdue: string;
  pendingCount: number;
  overdueCount: number;
}

export interface RevenuePoint {
  /** `YYYY-MM-DD` quando diário, `YYYY-MM` quando mensal. */
  bucket: string;
  label: string;
  total: string;
  count: number;
}

export interface MethodSlice {
  method: PaymentMethod;
  label: string;
  total: string;
  count: number;
}

/**
 * Mesma forma de `InvoiceStatusSlice` (types/dashboard.ts), de propósito: o
 * gráfico de rosca do painel é reaproveitado aqui sem adaptador. Um segundo
 * componente equivalente divergiria do primeiro na primeira correção de
 * acessibilidade feita só em um dos dois.
 */
export interface StatusSlice {
  status: EffectiveInvoiceStatus;
  label: string;
  count: number;
  amount: string;
  outstanding: string;
}

export interface FinanceOverview {
  period: ResolvedPeriod;
  /** Define se a série de receita está agrupada por dia ou por mês. */
  granularity: 'day' | 'month';
  cards: FinanceCards;
  revenueSeries: RevenuePoint[];
  receiptsByMethod: MethodSlice[];
  invoicesByStatus: StatusSlice[];
}

export interface FinanceEntry {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientDocument: string;
  contractNumber: string | null;
  amount: string;
  paidAmount: string;
  outstanding: string;
  issueDate: string;
  dueDate: string;
  /** Data do último pagamento, ou `null` se nenhum foi lançado. */
  paymentDate: string | null;
  paymentMethod: string | null;
  status: EffectiveInvoiceStatus;
}

export interface FinanceEntriesPage {
  items: FinanceEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Soma de TODAS as faturas do filtro, não só as da página. */
  totalAmount: string;
  period: ResolvedPeriod;
}

export interface FinanceFilters {
  period?: FinancePeriod;
  from?: string;
  to?: string;
  status?: EffectiveInvoiceStatus;
  clientId?: string;
  sort?: 'dueDate' | 'issueDate' | 'amount' | 'client';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/**
 * Opções do seletor de período.
 *
 * Ordem do mais curto ao mais longo: é como a pessoa raciocina ao estreitar
 * ou alargar o recorte, e evita o vaivém de uma lista fora de ordem.
 */
export const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'previous-month', label: 'Mês anterior' },
  { value: 'year', label: 'Ano' },
  { value: 'custom', label: 'Personalizado' },
];

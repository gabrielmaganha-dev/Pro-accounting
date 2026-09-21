import type { ClientSummary } from '@/types/client';
import type {
  ContractStatus,
  EffectiveInvoiceStatus,
  PaymentMethod,
} from '@/types/dashboard';

export type { EffectiveInvoiceStatus, PaymentMethod };

/**
 * Situação GRAVADA na coluna, que é diferente da exibida.
 *
 * `OVERDUE` não aparece aqui de propósito: atrasada é derivada da data de
 * vencimento pela API, nunca armazenada. A interface usa `storedStatus` apenas
 * para saber se a fatura está cancelada — e portanto se cabe reabri-la.
 */
export type StoredInvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED';

/** Contrato resumido que acompanha a fatura quando ela não é avulsa. */
export interface InvoiceContract {
  id: string;
  number: string;
  serviceType: string;
  status: ContractStatus;
}

export interface Invoice {
  id: string;
  number: string;
  description: string | null;
  /** String, não number: o Decimal do banco perderia centavos em `number`. */
  amount: string;
  paidAmount: string;
  outstanding: string;
  /** `YYYY-MM-DD`, sem hora e sem fuso. */
  issueDate: string;
  dueDate: string;
  /** Data do último pagamento, ou `null` se nenhum foi lançado. */
  lastPaymentDate: string | null;
  paymentCount: number;
  /** Situação EFETIVA, já com a regra de atraso aplicada pela API. */
  status: EffectiveInvoiceStatus;
  storedStatus: StoredInvoiceStatus;
  /** Positivo = dias vencidos; negativo = dias que faltam. */
  daysOverdue: number;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  client: ClientSummary;
  /** Nulo em fatura avulsa, emitida sem contrato. */
  contractId: string | null;
  contract: InvoiceContract | null;
}

export interface Payment {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  createdAt: string;
  registeredByName: string;
}

export type InvoiceHistoryAction =
  | 'CREATED'
  | 'UPDATED'
  | 'CANCELLED'
  | 'REOPENED'
  | 'PAYMENT_ADDED'
  | 'PAYMENT_REMOVED'
  | 'SETTLED';

export interface InvoiceHistoryEntry {
  id: string;
  action: InvoiceHistoryAction;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  userName: string;
}

export interface InvoiceListFilters {
  search?: string;
  clientId?: string;
  contractId?: string;
  status?: EffectiveInvoiceStatus;
  issueFrom?: string;
  issueTo?: string;
  dueFrom?: string;
  dueTo?: string;
  minAmount?: string;
  maxAmount?: string;
  sort?: 'number' | 'issueDate' | 'dueDate' | 'amount' | 'createdAt' | 'client';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface InvoicePayload {
  clientId: string;
  /** `null` grava fatura avulsa; ausente deixa o vínculo como está. */
  contractId?: string | null;
  number: string;
  description?: string | null;
  amount: string;
  issueDate: string;
  dueDate: string;
}

export interface PaymentPayload {
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  /**
   * Libera o lançamento quando a API detectou um pagamento idêntico.
   *
   * Só é enviado depois de o usuário ver a recusa e confirmar que é mesmo um
   * segundo pagamento — nunca por padrão.
   */
  confirmDuplicate?: boolean;
}

export const INVOICE_STATUS_OPTIONS: readonly EffectiveInvoiceStatus[] = [
  'PENDING',
  'OVERDUE',
  'PAID',
  'CANCELLED',
];

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethod[] = [
  'PIX',
  'BOLETO',
  'TRANSFER',
  'CASH',
  'CARD',
  'OTHER',
];

/**
 * Texto de cada evento do histórico.
 *
 * Frases prontas em vez de rótulos soltos: "Pagamento registrado" comunica o
 * que houve; "PAYMENT_ADDED" obrigaria o usuário a traduzir mentalmente.
 */
export const INVOICE_HISTORY_ACTION_LABELS: Record<InvoiceHistoryAction, string> = {
  CREATED: 'Fatura emitida',
  UPDATED: 'Alteração',
  CANCELLED: 'Fatura cancelada',
  REOPENED: 'Fatura reaberta',
  PAYMENT_ADDED: 'Pagamento registrado',
  PAYMENT_REMOVED: 'Pagamento estornado',
  SETTLED: 'Fatura quitada',
};

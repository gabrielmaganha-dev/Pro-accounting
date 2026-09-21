import type { EffectiveInvoiceStatus, PaymentMethod } from '@/types/dashboard';

export type { PaymentMethod };

/** Fatura resumida que acompanha o pagamento no histórico. */
export interface PaymentInvoice {
  id: string;
  number: string;
  amount: string;
  dueDate: string;
  /** Situação EFETIVA da fatura hoje, não a do dia do pagamento. */
  status: EffectiveInvoiceStatus;
}

export interface PaymentClient {
  id: string;
  name: string;
  companyName: string | null;
  cpfCnpj: string;
}

export interface PaymentContract {
  id: string;
  number: string;
  serviceType: string;
}

export interface PaymentRecord {
  id: string;
  /** String, não number: o Decimal do banco perderia centavos em `number`. */
  amount: string;
  /** `YYYY-MM-DD`, sem hora e sem fuso. */
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  createdAt: string;
  registeredById: string | null;
  registeredByName: string;
  invoice: PaymentInvoice;
  client: PaymentClient;
  /** Nulo quando a fatura é avulsa, sem contrato. */
  contract: PaymentContract | null;
}

/** Detalhe traz também como está a fatura toda, não só este lançamento. */
export interface PaymentDetail extends PaymentRecord {
  invoiceContext: {
    paidAmount: string;
    outstanding: string;
    paymentCount: number;
  };
}

/** A listagem devolve o total financeiro do filtro, além da página. */
export interface PaginatedPayments {
  items: PaymentRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Soma de TODOS os pagamentos do filtro, não apenas os da página. */
  totalAmount: string;
}

export interface PaymentListFilters {
  search?: string;
  clientId?: string;
  invoiceId?: string;
  contractId?: string;
  paymentMethod?: PaymentMethod;
  registeredBy?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: string;
  maxAmount?: string;
  sort?: 'paymentDate' | 'amount' | 'createdAt' | 'client';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

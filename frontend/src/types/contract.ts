import type { ClientSummary } from '@/types/client';
import type { ContractStatus, EffectiveInvoiceStatus } from '@/types/dashboard';

export type { ContractStatus };

/** Cliente resumido que acompanha o contrato em toda resposta da API. */
export type ContractClient = ClientSummary;

export interface Contract {
  id: string;
  number: string;
  serviceType: string;
  /** String, não number: o Decimal do banco perderia centavos em `number`. */
  monthlyValue: string;
  dueDay: number;
  /** `YYYY-MM-DD`, sem hora e sem fuso. */
  startDate: string;
  /** Nulo = prazo indeterminado. */
  endDate: string | null;
  status: ContractStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  client: ContractClient;
}

/**
 * A ficha do contrato NÃO traz a lista de faturas.
 *
 * Elas vêm de `GET /contracts/:id/invoices`, paginadas — mesmo critério usado
 * na ficha do cliente: um contrato antigo acumula dezenas de faturas e
 * carregá-las junto tornaria lenta a abertura da tela para quem só queria
 * conferir o valor mensal.
 */
export interface ContractDetail extends Contract {
  summary: {
    invoices: {
      total: number;
      paid: number;
      pending: number;
      overdue: number;
      cancelled: number;
    };
    amounts: {
      /** Total emitido, exceto canceladas. */
      invoiced: string;
      received: string;
      pending: string;
      overdue: string;
    };
  };
}

export interface ContractInvoice {
  id: string;
  number: string;
  description: string | null;
  amount: string;
  /** Quanto já foi pago — revela pagamento parcial. */
  paidAmount: string;
  outstanding: string;
  issueDate: string;
  dueDate: string;
  status: EffectiveInvoiceStatus;
}

export interface ContractListFilters {
  search?: string;
  status?: ContractStatus;
  clientId?: string;
  expiringInDays?: number;
  sort?: 'number' | 'startDate' | 'endDate' | 'monthlyValue' | 'createdAt' | 'client';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ContractPayload {
  clientId: string;
  number: string;
  serviceType: string;
  startDate: string;
  /** `null` grava prazo indeterminado; ausente deixa o valor como está. */
  endDate?: string | null;
  monthlyValue: string;
  dueDay: number;
  status?: ContractStatus;
  notes?: string;
}

export interface RenewContractPayload {
  endDate: string;
  /** Ausente = renovação sem reajuste. */
  monthlyValue?: string;
}

export const CONTRACT_STATUS_OPTIONS: readonly ContractStatus[] = [
  'ACTIVE',
  'PENDING',
  'RENEWAL',
  'CLOSED',
  'CANCELLED',
];

/**
 * Explicação de cada situação, exibida no formulário.
 *
 * "Pendente" e "Em renovação" não são autoexplicativos: sem uma linha dizendo
 * o que significam, cada usuário atribui um sentido diferente e o filtro da
 * listagem deixa de querer dizer alguma coisa.
 */
export const CONTRACT_STATUS_HINTS: Record<ContractStatus, string> = {
  ACTIVE: 'Em vigência e gerando cobrança.',
  PENDING: 'Acordado, mas ainda não começou a valer.',
  RENEWAL: 'Vigência terminando, renovação em negociação.',
  CLOSED: 'Chegou ao fim. Mantém todo o histórico de faturas.',
  CANCELLED: 'Desfeito antes de produzir efeito.',
};

import type { ContractStatus, PaymentMethod } from '@prisma/client';

/**
 * Contrato de resposta de `GET /api/dashboard`.
 *
 * Todo valor monetário trafega como STRING, não number.
 *
 * O motivo: o tipo `number` do JavaScript é ponto flutuante binário e não
 * representa exatamente valores decimais — `0.1 + 0.2` dá `0.30000000000000004`.
 * Somar milhares de faturas assim acumula erro de centavo, e num painel
 * financeiro isso vira divergência com o extrato. A soma é feita pelo
 * PostgreSQL em `numeric`, que é exato, e o resultado é serializado como texto
 * para atravessar o JSON sem perder precisão.
 */

/** Status efetivo da fatura: o do banco, com ATRASADO derivado pela data. */
export type EffectiveInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface DashboardCards {
  clients: {
    total: number;
    active: number;
    inactive: number;
  };
  contracts: {
    total: number;
    active: number;
    closed: number;
    cancelled: number;
    /** Ativos cujo término cai dentro da janela de alerta. */
    expiringSoon: number;
  };
  invoices: {
    total: number;
    paid: number;
    /** Pendentes AINDA NÃO vencidas. Não inclui as atrasadas. */
    pending: number;
    overdue: number;
    cancelled: number;
  };
  amounts: {
    /** Dinheiro efetivamente recebido (soma dos pagamentos registrados). */
    received: string;
    /** A receber de faturas pendentes ainda no prazo, já descontados pagamentos parciais. */
    pending: string;
    /** A receber de faturas vencidas, já descontados pagamentos parciais. */
    overdue: string;
  };
}

export interface MonthlyRevenuePoint {
  /** `YYYY-MM` */
  month: string;
  /** `mar/26` */
  label: string;
  total: string;
  paymentCount: number;
}

export interface InvoiceStatusSlice {
  status: EffectiveInvoiceStatus;
  label: string;
  count: number;
  /** Valor de face somado — o total emitido neste status. */
  amount: string;
  /**
   * Saldo ainda em aberto, já descontados pagamentos parciais.
   *
   * Existe separado de `amount` porque os dois divergem quando há pagamento
   * parcial: uma fatura de R$ 675 com R$ 270 pagos entra como R$ 675 em
   * `amount` e R$ 405 em `outstanding`. Os cards do painel usam `outstanding`
   * (é o que o escritório ainda tem a receber); sem expor os dois, o gráfico
   * exibiria um número diferente do card para o mesmo status, sem nada na
   * tela explicando a diferença.
   */
  outstanding: string;
}

export interface NewClientsPoint {
  month: string;
  label: string;
  count: number;
}

export interface ContractStatusSlice {
  status: ContractStatus;
  label: string;
  count: number;
}

export interface DashboardCharts {
  monthlyRevenue: MonthlyRevenuePoint[];
  invoicesByStatus: InvoiceStatusSlice[];
  newClientsByMonth: NewClientsPoint[];
  contractsByStatus: ContractStatusSlice[];
}

export interface AlertInvoiceItem {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  amount: string;
  dueDate: string;
  /** Negativo = vence em N dias; positivo = vencida há N dias. */
  daysOverdue: number;
}

export interface AlertContractItem {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  endDate: string;
  daysUntilExpiry: number;
  monthlyValue: string;
}

export interface InvoiceAlertGroup {
  count: number;
  amount: string;
  items: AlertInvoiceItem[];
}

export interface DashboardAlerts {
  overdueInvoices: InvoiceAlertGroup;
  dueTodayInvoices: InvoiceAlertGroup;
  dueSoonInvoices: InvoiceAlertGroup;
  expiringContracts: {
    count: number;
    items: AlertContractItem[];
  };
}

export interface RecentClient {
  id: string;
  name: string;
  cpfCnpj: string;
  createdAt: string;
}

export interface RecentContract {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  monthlyValue: string;
  status: ContractStatus;
  createdAt: string;
}

export interface RecentInvoice {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  amount: string;
  status: EffectiveInvoiceStatus;
  createdAt: string;
}

export interface RecentPayment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  amount: string;
  paymentMethod: PaymentMethod;
  registeredByName: string;
  createdAt: string;
}

export interface DashboardRecentActivity {
  clients: RecentClient[];
  contracts: RecentContract[];
  invoices: RecentInvoice[];
  payments: RecentPayment[];
}

export interface DashboardResponse {
  /** Momento da consulta, para o frontend poder exibir "atualizado às ...". */
  generatedAt: string;
  /** Dia de referência usado nos cálculos, no fuso do escritório. */
  referenceDate: string;
  cards: DashboardCards;
  charts: DashboardCharts;
  alerts: DashboardAlerts;
  recentActivity: DashboardRecentActivity;
}

/**
 * Espelho de backend/src/types/dashboard.ts.
 *
 * Valores monetários são STRING, não number: a soma é feita em `numeric` pelo
 * PostgreSQL (aritmética exata) e atravessa o JSON como texto para não perder
 * centavos no ponto flutuante do JavaScript. A conversão para number acontece
 * só na hora de desenhar o gráfico, onde um erro na 15ª casa decimal é
 * irrelevante — nunca em um total exibido ao usuário.
 */

export type EffectiveInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type ContractStatus = 'ACTIVE' | 'PENDING' | 'RENEWAL' | 'CLOSED' | 'CANCELLED';

export type PaymentMethod =
  | 'PIX'
  | 'BOLETO'
  | 'TRANSFER'
  | 'CASH'
  | 'CARD'
  | 'OTHER';

export interface DashboardCards {
  clients: { total: number; active: number; inactive: number };
  contracts: {
    total: number;
    active: number;
    closed: number;
    cancelled: number;
    expiringSoon: number;
  };
  invoices: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
    cancelled: number;
  };
  amounts: { received: string; pending: string; overdue: string };
}

export interface MonthlyRevenuePoint {
  month: string;
  label: string;
  total: string;
  paymentCount: number;
}

export interface InvoiceStatusSlice {
  status: EffectiveInvoiceStatus;
  label: string;
  count: number;
  /** Valor de face emitido. */
  amount: string;
  /** Saldo em aberto, descontados pagamentos parciais. */
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
  expiringContracts: { count: number; items: AlertContractItem[] };
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
  generatedAt: string;
  referenceDate: string;
  cards: DashboardCards;
  charts: DashboardCharts;
  alerts: DashboardAlerts;
  recentActivity: DashboardRecentActivity;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  OTHER: 'Outro',
};

export const INVOICE_STATUS_LABELS: Record<EffectiveInvoiceStatus, string> = {
  PAID: 'Paga',
  PENDING: 'Pendente',
  OVERDUE: 'Atrasada',
  CANCELLED: 'Cancelada',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Ativo',
  PENDING: 'Pendente',
  RENEWAL: 'Em renovação',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

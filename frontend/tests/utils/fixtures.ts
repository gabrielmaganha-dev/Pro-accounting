import type { ClientDetail } from '@/types/client';
import type { DashboardResponse } from '@/types/dashboard';
import type { Invoice } from '@/types/invoice';

/** Respostas da API com a mesma forma que o backend devolve. */

export function paginated<T>(items: T[], overrides: Record<string, number> = {}) {
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: 1, ...overrides };
}

export function dashboardFixture(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  const emptyGroup = { count: 0, amount: '0.00', items: [] };

  return {
    generatedAt: '2026-09-25T12:00:00.000Z',
    referenceDate: '2026-09-25',
    cards: {
      clients: { total: 12, active: 10, inactive: 2 },
      contracts: { total: 8, active: 6, closed: 1, cancelled: 1, expiringSoon: 1 },
      invoices: { total: 30, paid: 20, pending: 6, overdue: 3, cancelled: 1 },
      amounts: { received: '45250.00', pending: '9000.00', overdue: '3150.50' },
    },
    charts: {
      monthlyRevenue: [{ month: '2026-09', label: 'set/26', total: '45250.00', paymentCount: 20 }],
      invoicesByStatus: [],
      newClientsByMonth: [],
      contractsByStatus: [],
    },
    alerts: {
      overdueInvoices: emptyGroup,
      dueTodayInvoices: emptyGroup,
      dueSoonInvoices: emptyGroup,
      expiringContracts: { count: 0, items: [] },
    },
    recentActivity: { clients: [], contracts: [], invoices: [], payments: [] },
    ...overrides,
  };
}

export function clientDetailFixture(overrides: Partial<ClientDetail> = {}): ClientDetail {
  return {
    id: 'c-1',
    name: 'Padaria Pão Quente Ltda',
    companyName: 'Pão Quente',
    cpfCnpj: '11222333000181',
    stateRegistration: null,
    email: 'contato@paoquente.com.br',
    phone: '1133334444',
    whatsapp: null,
    zipCode: '01310100',
    street: 'Avenida Paulista',
    number: '1000',
    complement: null,
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    status: 'ACTIVE',
    notes: null,
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-01-10T12:00:00.000Z',
    contracts: [],
    summary: {
      contracts: { total: 0, active: 0 },
      invoices: { total: 0, paid: 0, pending: 0, overdue: 0, cancelled: 0 },
      amounts: { invoiced: '0.00', received: '0.00', pending: '0.00', overdue: '0.00' },
    },
    ...overrides,
  };
}

export function invoiceFixture(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    number: 'FAT-2026-00001',
    description: 'Honorários de setembro',
    amount: '1500.00',
    paidAmount: '0.00',
    outstanding: '1500.00',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    lastPaymentDate: null,
    paymentCount: 0,
    status: 'PENDING',
    storedStatus: 'PENDING',
    daysOverdue: -5,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    clientId: 'c-1',
    client: {
      id: 'c-1',
      name: 'Padaria Pão Quente Ltda',
      companyName: 'Pão Quente',
      cpfCnpj: '11222333000181',
      status: 'ACTIVE',
    },
    contractId: null,
    contract: null,
    ...overrides,
  };
}

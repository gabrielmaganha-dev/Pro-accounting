import { InvoiceStatus, type Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { today, utcToIsoDate } from '../../utils/date.js';
import { effectiveInvoiceStatus, fromCents, toCents } from '../../utils/invoice-status.js';
import {
  countSummary,
  dateRange,
  daysBetween,
  decimalToString,
  moneySummary,
} from '../helpers.js';
import type { ReportDefinition, ReportFilters, ReportResult } from '../types.js';

/**
 * Relatórios de faturas.
 *
 * ATRASADA não existe na coluna `status` — é derivada: pendente com vencimento
 * no passado. A regra vive em `utils/invoice-status.ts` e é a mesma do módulo
 * de faturas, do painel, do financeiro e das notificações. Reimplementá-la aqui
 * criaria um sexto lugar para ela divergir.
 *
 * A consequência prática está no `where` abaixo: filtrar "pendentes" precisa
 * EXCLUIR as vencidas, senão a mesma fatura apareceria nos dois relatórios e a
 * soma das partes passaria do total.
 */

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Atrasada',
  CANCELLED: 'Cancelada',
};

const SELECT = {
  id: true,
  number: true,
  amount: true,
  issueDate: true,
  dueDate: true,
  status: true,
  description: true,
  client: { select: { name: true, cpfCnpj: true } },
  contract: { select: { number: true } },
  payments: { select: { amount: true, paymentDate: true } },
} as const satisfies Prisma.InvoiceSelect;

type Row = Prisma.InvoiceGetPayload<{ select: typeof SELECT }>;

const COLUMNS = [
  { key: 'number', label: 'Fatura', kind: 'text' as const, width: 13 },
  { key: 'clientName', label: 'Cliente', kind: 'text' as const, width: 24 },
  { key: 'contractNumber', label: 'Contrato', kind: 'text' as const, width: 12 },
  { key: 'issueDate', label: 'Emissão', kind: 'date' as const, width: 10 },
  { key: 'dueDate', label: 'Vencimento', kind: 'date' as const, width: 10 },
  { key: 'amount', label: 'Valor', kind: 'money' as const, width: 12 },
  { key: 'paidAmount', label: 'Recebido', kind: 'money' as const, width: 12 },
  { key: 'outstanding', label: 'Em aberto', kind: 'money' as const, width: 12 },
  { key: 'status', label: 'Situação', kind: 'text' as const, width: 10 },
];

/** Atrasadas trocam "recebido" por "dias em atraso", que é o que se olha. */
const OVERDUE_COLUMNS = [
  ...COLUMNS.slice(0, 6),
  { key: 'outstanding', label: 'Em aberto', kind: 'money' as const, width: 12 },
  { key: 'daysLate', label: 'Dias em atraso', kind: 'integer' as const, width: 11 },
];

function toRow(invoice: Row, reference: string) {
  const amountCents = toCents(invoice.amount);
  const paidCents = invoice.payments.reduce((sum, item) => sum + toCents(item.amount), 0);

  const dueDate = utcToIsoDate(invoice.dueDate);
  const status = effectiveInvoiceStatus(invoice.status, dueDate, reference);

  return {
    number: invoice.number,
    clientName: invoice.client.name,
    contractNumber: invoice.contract?.number ?? null,
    issueDate: utcToIsoDate(invoice.issueDate),
    dueDate,
    amount: invoice.amount.toFixed(2),
    paidAmount: fromCents(paidCents),
    outstanding: fromCents(Math.max(amountCents - paidCents, 0)),
    daysLate: status === 'OVERDUE' ? daysBetween(dueDate, reference) : null,
    status: INVOICE_STATUS_LABELS[status] ?? status,
  };
}

/**
 * Traduz a situação pedida no `where` do Prisma.
 *
 * Exportado porque os relatórios financeiros usam exatamente a mesma tradução —
 * e duas versões dela é o começo de dois números diferentes para "atrasado".
 */
export function applyEffectiveStatus(
  where: Prisma.InvoiceWhereInput,
  status: string | undefined,
  reference: string,
): void {
  if (!status) return;

  const referenceDate = new Date(`${reference}T00:00:00.000Z`);

  if (status === 'OVERDUE') {
    where.status = InvoiceStatus.PENDING;
    where.dueDate = { lt: referenceDate };
    return;
  }

  if (status === 'PENDING') {
    where.status = InvoiceStatus.PENDING;
    // O vencimento a partir de hoje é o que separa pendente de atrasada.
    where.dueDate = { gte: referenceDate };
    return;
  }

  where.status = status as InvoiceStatus;
}

/** Campo de data sobre o qual o período incide. Varia por relatório. */
type PeriodField = 'issueDate' | 'dueDate';

async function runInvoices(
  status: string,
  periodOn: PeriodField,
  filters: ReportFilters,
  page: number,
  pageSize: number,
): Promise<ReportResult> {
  const reference = today();
  const where: Prisma.InvoiceWhereInput = {};

  if (filters.clientId) where.clientId = filters.clientId;

  applyEffectiveStatus(where, status, reference);

  const range = dateRange(filters.from, filters.to);

  if (range) {
    // `applyEffectiveStatus` já pode ter escrito em `dueDate` para derivar
    // ATRASADA. Combinar os dois com AND evita que o recorte de período apague
    // a condição que define a situação — e vice-versa.
    if (periodOn === 'dueDate' && where.dueDate) {
      where.AND = [{ dueDate: where.dueDate }, { dueDate: range }];
      delete where.dueDate;
    } else {
      where[periodOn] = range;
    }
  }

  const [total, items, aggregate, paid] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: SELECT,
      orderBy: periodOn === 'dueDate' ? { dueDate: 'asc' } : { issueDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.aggregate({ where, _sum: { amount: true } }),
    // Recebido sobre o MESMO recorte: soma dos pagamentos das faturas filtradas.
    prisma.payment.aggregate({ where: { invoice: where }, _sum: { amount: true } }),
  ]);

  const faceValue = decimalToString(aggregate._sum.amount);
  const received = decimalToString(paid._sum.amount);
  const outstanding = fromCents(
    Math.max(toCents(faceValue) - toCents(received), 0),
  );

  const summary = [
    countSummary('Faturas', total),
    moneySummary('Valor total', faceValue),
    moneySummary('Recebido', received),
    moneySummary('Em aberto', outstanding),
  ];

  return { rows: items.map((invoice) => toRow(invoice, reference)), summary, total };
}

export const invoiceReports: ReportDefinition[] = [
  {
    id: 'invoices-paid',
    title: 'Faturas pagas',
    description:
      'Faturas quitadas — valor de face totalmente coberto pelos pagamentos. ' +
      'Faturas com pagamento parcial ainda aparecem como pendentes ou atrasadas.',
    group: 'invoices',
    restricted: false,
    periodField: 'Data de emissão',
    filters: { period: true, client: true, statuses: [] },
    columns: COLUMNS,
    run: (filters, page, pageSize) =>
      runInvoices('PAID', 'issueDate', filters, page, pageSize),
  },
  {
    id: 'invoices-pending',
    title: 'Faturas pendentes',
    description:
      'Faturas em aberto com vencimento a partir de hoje. As vencidas não entram aqui — ' +
      'estão no relatório de atrasadas, para que a soma dos dois não conte duas vezes.',
    group: 'invoices',
    restricted: false,
    periodField: 'Data de vencimento',
    filters: { period: true, client: true, statuses: [] },
    columns: COLUMNS,
    run: (filters, page, pageSize) =>
      runInvoices('PENDING', 'dueDate', filters, page, pageSize),
  },
  {
    id: 'invoices-overdue',
    title: 'Faturas atrasadas',
    description:
      'Faturas em aberto com vencimento no passado, da mais antiga para a mais recente, ' +
      'com os dias de atraso. Situação derivada da data, não gravada no banco.',
    group: 'invoices',
    restricted: false,
    periodField: 'Data de vencimento',
    filters: { period: true, client: true, statuses: [] },
    columns: OVERDUE_COLUMNS,
    run: (filters, page, pageSize) =>
      runInvoices('OVERDUE', 'dueDate', filters, page, pageSize),
  },
  {
    id: 'invoices-cancelled',
    title: 'Faturas canceladas',
    description:
      'Faturas retiradas do faturamento. Continuam no sistema com número e histórico — ' +
      'cancelar preserva o documento, excluir o apagaria.',
    group: 'invoices',
    restricted: false,
    periodField: 'Data de emissão',
    filters: { period: true, client: true, statuses: [] },
    columns: COLUMNS,
    run: (filters, page, pageSize) =>
      runInvoices('CANCELLED', 'issueDate', filters, page, pageSize),
  },
];

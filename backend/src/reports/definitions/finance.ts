import { InvoiceStatus, type PaymentMethod, type Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { today, utcToIsoDate } from '../../utils/date.js';
import { fromCents, toCents } from '../../utils/invoice-status.js';
import {
  countSummary,
  dateRange,
  daysBetween,
  decimalToString,
  moneySummary,
} from '../helpers.js';
import type { ReportDefinition, ReportFilters, ReportResult } from '../types.js';
import { applyEffectiveStatus } from './invoices.js';

/**
 * Relatórios financeiros — **restritos a administrador**.
 *
 * A diferença em relação aos relatórios de faturas não é o dado bruto, é o
 * RECORTE. Um relatório de faturas responde "em que situação está esta
 * cobrança"; um relatório financeiro responde "quanto o escritório faturou,
 * recebeu e tem a receber". O primeiro é rotina de atendimento, o segundo é
 * informação de gestão — e é por isso que só este grupo tem `restricted: true`.
 *
 * Recebimentos é o único relatório do sistema cuja LINHA é um pagamento, e não
 * uma fatura. Tinha de ser: uma fatura paga em três parcelas, com formas e
 * datas diferentes, é uma linha só na visão de cobrança e três lançamentos no
 * caixa. Somar o caixa a partir das faturas daria o número certo pelo motivo
 * errado, e erraria no primeiro pagamento parcial que atravessasse o mês.
 */

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  OTHER: 'Outro',
};

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const INVOICE_SELECT = {
  id: true,
  number: true,
  amount: true,
  issueDate: true,
  dueDate: true,
  status: true,
  client: { select: { name: true, cpfCnpj: true } },
  contract: { select: { number: true } },
  payments: { select: { amount: true } },
} as const satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

function invoiceAmounts(invoice: InvoiceRow) {
  const amountCents = toCents(invoice.amount);
  const paidCents = invoice.payments.reduce((sum, item) => sum + toCents(item.amount), 0);

  return {
    amount: invoice.amount.toFixed(2),
    paidAmount: fromCents(paidCents),
    outstanding: fromCents(Math.max(amountCents - paidCents, 0)),
  };
}

// ---------------------------------------------------------------------------
// Faturamento — o que foi cobrado no período
// ---------------------------------------------------------------------------

const BILLING_COLUMNS = [
  { key: 'number', label: 'Fatura', kind: 'text' as const, width: 13 },
  { key: 'clientName', label: 'Cliente', kind: 'text' as const, width: 26 },
  { key: 'contractNumber', label: 'Contrato', kind: 'text' as const, width: 12 },
  { key: 'issueDate', label: 'Emissão', kind: 'date' as const, width: 10 },
  { key: 'dueDate', label: 'Vencimento', kind: 'date' as const, width: 10 },
  { key: 'amount', label: 'Valor faturado', kind: 'money' as const, width: 13 },
  { key: 'paidAmount', label: 'Recebido', kind: 'money' as const, width: 12 },
  { key: 'outstanding', label: 'A receber', kind: 'money' as const, width: 12 },
];

async function runBilling(
  filters: ReportFilters,
  page: number,
  pageSize: number,
): Promise<ReportResult> {
  const reference = today();
  const where: Prisma.InvoiceWhereInput = {};

  if (filters.clientId) where.clientId = filters.clientId;

  /**
   * Canceladas ficam FORA por padrão.
   *
   * Faturamento é o que o escritório cobrou; uma fatura cancelada não foi
   * cobrada de ninguém. Incluí-la infla o número e faz o relatório discordar do
   * módulo financeiro, que já a exclui. Quem quiser vê-las escolhe a situação
   * no filtro — aí é um pedido explícito.
   */
  if (filters.status) applyEffectiveStatus(where, filters.status, reference);
  else where.status = { not: InvoiceStatus.CANCELLED };

  const range = dateRange(filters.from, filters.to);
  if (range) where.issueDate = range;

  const [total, items, aggregate, paid] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: INVOICE_SELECT,
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.aggregate({ where, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { invoice: where }, _sum: { amount: true } }),
  ]);

  const billed = decimalToString(aggregate._sum.amount);
  const received = decimalToString(paid._sum.amount);

  return {
    rows: items.map((invoice) => ({
      number: invoice.number,
      clientName: invoice.client.name,
      contractNumber: invoice.contract?.number ?? null,
      issueDate: utcToIsoDate(invoice.issueDate),
      dueDate: utcToIsoDate(invoice.dueDate),
      ...invoiceAmounts(invoice),
    })),
    summary: [
      moneySummary('Faturado', billed, 'Soma do valor de face das faturas emitidas'),
      moneySummary('Recebido', received, 'Pagamentos lançados nessas faturas'),
      moneySummary(
        'A receber',
        fromCents(Math.max(toCents(billed) - toCents(received), 0)),
      ),
      countSummary('Faturas emitidas', total),
    ],
    total,
  };
}

// ---------------------------------------------------------------------------
// Recebimentos — o caixa do período. A linha é um PAGAMENTO.
// ---------------------------------------------------------------------------

const RECEIPTS_COLUMNS = [
  { key: 'paymentDate', label: 'Data', kind: 'date' as const, width: 10 },
  { key: 'clientName', label: 'Cliente', kind: 'text' as const, width: 26 },
  { key: 'invoiceNumber', label: 'Fatura', kind: 'text' as const, width: 13 },
  { key: 'method', label: 'Forma', kind: 'text' as const, width: 13 },
  { key: 'amount', label: 'Valor recebido', kind: 'money' as const, width: 13 },
  { key: 'invoiceAmount', label: 'Valor da fatura', kind: 'money' as const, width: 13 },
  { key: 'registeredBy', label: 'Registrado por', kind: 'text' as const, width: 18 },
];

async function runReceipts(
  filters: ReportFilters,
  page: number,
  pageSize: number,
): Promise<ReportResult> {
  const where: Prisma.PaymentWhereInput = {};

  if (filters.clientId) where.invoice = { clientId: filters.clientId };

  if (filters.status) where.paymentMethod = filters.status as PaymentMethod;

  const range = dateRange(filters.from, filters.to);
  if (range) where.paymentDate = range;

  const [total, items, aggregate, byMethod] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        user: { select: { name: true } },
        invoice: {
          select: { number: true, amount: true, client: { select: { name: true } } },
        },
      },
      orderBy: { paymentDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
    // Agrupamento no banco: a forma de recebimento mais usada no período.
    // `orderBy` é exigido pelo tipo do groupBy no Prisma 6, mesmo quando a
    // ordem não importa — o desempate final é feito abaixo, por valor.
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { amount: true },
      orderBy: { paymentMethod: 'asc' },
    }),
  ]);

  const received = decimalToString(aggregate._sum.amount);

  const top = byMethod
    .map((item) => ({
      method: item.paymentMethod,
      total: toCents(decimalToString(item._sum?.amount ?? null)),
    }))
    .sort((a, b) => b.total - a.total)[0];

  return {
    rows: items.map((payment) => ({
      paymentDate: utcToIsoDate(payment.paymentDate),
      clientName: payment.invoice.client.name,
      invoiceNumber: payment.invoice.number,
      method: PAYMENT_METHOD_LABELS[payment.paymentMethod],
      amount: payment.amount.toFixed(2),
      invoiceAmount: payment.invoice.amount.toFixed(2),
      registeredBy: payment.user.name,
    })),
    summary: [
      moneySummary('Total recebido', received, 'Soma dos pagamentos lançados no período'),
      countSummary('Lançamentos', total),
      ...(top
        ? [
            {
              label: 'Forma mais usada',
              value: `${PAYMENT_METHOD_LABELS[top.method]} — R$ ${fromCents(top.total).replace('.', ',')}`,
              kind: 'text' as const,
            },
          ]
        : []),
    ],
    total,
  };
}

// ---------------------------------------------------------------------------
// Pendências e atrasos — o que falta entrar
// ---------------------------------------------------------------------------

const OUTSTANDING_COLUMNS = [
  { key: 'clientName', label: 'Cliente', kind: 'text' as const, width: 24 },
  { key: 'number', label: 'Fatura', kind: 'text' as const, width: 13 },
  { key: 'contractNumber', label: 'Contrato', kind: 'text' as const, width: 11 },
  { key: 'dueDate', label: 'Vencimento', kind: 'date' as const, width: 10 },
  { key: 'amount', label: 'Valor', kind: 'money' as const, width: 12 },
  { key: 'paidAmount', label: 'Já recebido', kind: 'money' as const, width: 12 },
  { key: 'outstanding', label: 'Em aberto', kind: 'money' as const, width: 12 },
];

const OVERDUE_COLUMNS = [
  ...OUTSTANDING_COLUMNS,
  { key: 'daysLate', label: 'Dias em atraso', kind: 'integer' as const, width: 11 },
  { key: 'aging', label: 'Faixa', kind: 'text' as const, width: 12 },
];

/**
 * Faixas de aging.
 *
 * Um valor atrasado há 5 dias e outro há 200 exigem ações diferentes — lembrete
 * por WhatsApp contra cobrança formal. Uma coluna com o número de dias obriga
 * quem lê a classificar de cabeça linha por linha; a faixa já entrega o
 * agrupamento pronto para um filtro de planilha.
 */
function agingBand(days: number): string {
  if (days <= 15) return '1 a 15 dias';
  if (days <= 30) return '16 a 30 dias';
  if (days <= 60) return '31 a 60 dias';
  if (days <= 90) return '61 a 90 dias';
  return 'mais de 90 dias';
}

async function runOutstanding(
  kind: 'pending' | 'overdue',
  filters: ReportFilters,
  page: number,
  pageSize: number,
): Promise<ReportResult> {
  const reference = today();
  const where: Prisma.InvoiceWhereInput = {};

  if (filters.clientId) where.clientId = filters.clientId;

  applyEffectiveStatus(where, kind === 'overdue' ? 'OVERDUE' : 'PENDING', reference);

  const range = dateRange(filters.from, filters.to);

  if (range) {
    // A situação já restringe `dueDate`; o AND preserva as duas condições.
    where.AND = [{ dueDate: where.dueDate as Prisma.DateTimeFilter }, { dueDate: range }];
    delete where.dueDate;
  }

  const [total, items, aggregate, paid] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: INVOICE_SELECT,
      // Atrasadas: a mais antiga primeiro, que é a mais grave. Pendentes: a
      // que vence primeiro, que é a próxima a cobrar.
      orderBy: { dueDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.aggregate({ where, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { invoice: where }, _sum: { amount: true } }),
  ]);

  const faceValue = decimalToString(aggregate._sum.amount);
  const received = decimalToString(paid._sum.amount);
  const outstanding = fromCents(Math.max(toCents(faceValue) - toCents(received), 0));

  const rows = items.map((invoice) => {
    const dueDate = utcToIsoDate(invoice.dueDate);
    const daysLate = daysBetween(dueDate, reference);

    return {
      clientName: invoice.client.name,
      number: invoice.number,
      contractNumber: invoice.contract?.number ?? null,
      dueDate,
      ...invoiceAmounts(invoice),
      daysLate: kind === 'overdue' ? daysLate : null,
      aging: kind === 'overdue' ? agingBand(daysLate) : null,
    };
  });

  const summary = [
    moneySummary(
      kind === 'overdue' ? 'Total em atraso' : 'Total a receber',
      outstanding,
      'Valor de face menos o que já foi recebido',
    ),
    countSummary('Faturas', total),
    moneySummary('Valor de face', faceValue),
    moneySummary('Já recebido (parcial)', received),
  ];

  return { rows, summary, total };
}

export const financeReports: ReportDefinition[] = [
  {
    id: 'finance-billing',
    title: 'Faturamento',
    description:
      'O que o escritório cobrou no período, fatura por fatura, com quanto já entrou de ' +
      'cada uma. Canceladas ficam de fora: não foram cobradas de ninguém.',
    group: 'finance',
    restricted: true,
    periodField: 'Data de emissão',
    filters: {
      period: true,
      client: true,
      statuses: [
        { value: 'PAID', label: 'Pagas' },
        { value: 'PENDING', label: 'Pendentes' },
        { value: 'OVERDUE', label: 'Atrasadas' },
        { value: 'CANCELLED', label: 'Canceladas' },
      ],
    },
    columns: BILLING_COLUMNS,
    run: runBilling,
  },
  {
    id: 'finance-receipts',
    title: 'Recebimentos',
    description:
      'O caixa do período: cada linha é um pagamento lançado, com forma, valor e quem ' +
      'registrou. Uma fatura paga em três parcelas aparece em três linhas.',
    group: 'finance',
    restricted: true,
    periodField: 'Data do pagamento',
    // O "status" aqui é a forma de recebimento — é o recorte que faz sentido
    // sobre pagamentos, e a interface usa o mesmo controle.
    filters: { period: true, client: true, statuses: METHOD_OPTIONS },
    columns: RECEIPTS_COLUMNS,
    run: runReceipts,
  },
  {
    id: 'finance-pending',
    title: 'Pendências',
    description:
      'Faturas em aberto que ainda não venceram, da próxima a vencer em diante. ' +
      'É o que se espera receber, separado do que já está atrasado.',
    group: 'finance',
    restricted: true,
    periodField: 'Data de vencimento',
    filters: { period: true, client: true, statuses: [] },
    columns: OUTSTANDING_COLUMNS,
    run: (filters, page, pageSize) => runOutstanding('pending', filters, page, pageSize),
  },
  {
    id: 'finance-overdue',
    title: 'Atrasos',
    description:
      'Inadimplência com faixas de atraso — até 15 dias, até 30, até 60, até 90 e acima. ' +
      'A faixa serve para separar lembrete de cobrança formal.',
    group: 'finance',
    restricted: true,
    periodField: 'Data de vencimento',
    filters: { period: true, client: true, statuses: [] },
    columns: OVERDUE_COLUMNS,
    run: (filters, page, pageSize) => runOutstanding('overdue', filters, page, pageSize),
  },
];

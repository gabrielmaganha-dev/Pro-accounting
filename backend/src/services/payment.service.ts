import type { Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/app-error.js';
import { isoDateToUtc, today, utcToIsoDate } from '../utils/date.js';
import { effectiveInvoiceStatus, fromCents, toCents } from '../utils/invoice-status.js';
import type { ListPaymentsQuery } from '../validators/payment.validator.js';

/**
 * Histórico de pagamentos — visão transversal, por CAIXA e não por cobrança.
 *
 * A aba de pagamentos de uma fatura responde "o que entrou nesta cobrança".
 * Esta listagem responde outra pergunta: "o que entrou no escritório", sem
 * passar por fatura nenhuma. É o que permite fechar o dia, conferir o extrato
 * bancário contra o sistema e auditar o que cada usuário lançou.
 */

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  paymentDate: true,
  paymentMethod: true,
  notes: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
  invoice: {
    select: {
      id: true,
      number: true,
      amount: true,
      dueDate: true,
      status: true,
      client: { select: { id: true, name: true, companyName: true, cpfCnpj: true } },
      contract: { select: { id: true, number: true, serviceType: true } },
    },
  },
} as const;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

function toPaymentDto(payment: PaymentRow, referenceIso: string) {
  const dueDate = utcToIsoDate(payment.invoice.dueDate);

  return {
    id: payment.id,
    amount: payment.amount.toFixed(2),
    paymentDate: utcToIsoDate(payment.paymentDate),
    paymentMethod: payment.paymentMethod,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    // Usuário removido do sistema deixa o lançamento órfão, mas o registro
    // permanece: auditoria não pode desaparecer junto com a conta.
    registeredById: payment.user?.id ?? null,
    registeredByName: payment.user?.name ?? 'Usuário removido',
    invoice: {
      id: payment.invoice.id,
      number: payment.invoice.number,
      amount: payment.invoice.amount.toFixed(2),
      dueDate,
      // Situação EFETIVA da fatura, pela mesma regra do resto do sistema.
      status: effectiveInvoiceStatus(payment.invoice.status, dueDate, referenceIso),
    },
    client: payment.invoice.client,
    contract: payment.invoice.contract,
  };
}

export async function listPayments(query: ListPaymentsQuery) {
  const referenceIso = today();
  const where = buildWhere(query);

  // A contagem, a página e o total financeiro são disparados juntos na mesma
  // transação: precisam enxergar o mesmo estado, senão o total somado não
  // corresponderia às linhas exibidas.
  const [total, items, aggregate] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: buildOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: PAYMENT_SELECT,
    }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    items: items.map((payment) => toPaymentDto(payment, referenceIso)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    /**
     * Soma de TODOS os pagamentos que atendem ao filtro, não só os da página.
     *
     * É o número que a tela existe para responder — "quanto entrou neste
     * período" — e somar apenas a página daria uma resposta errada assim que
     * houvesse mais de vinte lançamentos.
     */
    totalAmount: aggregate._sum.amount ? aggregate._sum.amount.toFixed(2) : '0.00',
  };
}

function buildOrderBy(query: ListPaymentsQuery): Prisma.PaymentOrderByWithRelationInput {
  if (query.sort === 'client') {
    return { invoice: { client: { name: query.order } } };
  }

  return { [query.sort]: query.order };
}

function buildWhere(query: ListPaymentsQuery): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = {};
  const invoiceFilter: Prisma.InvoiceWhereInput = {};

  if (query.invoiceId) where.invoiceId = query.invoiceId;
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.registeredBy) where.registeredBy = query.registeredBy;

  if (query.clientId) invoiceFilter.clientId = query.clientId;
  if (query.contractId) invoiceFilter.contractId = query.contractId;

  if (query.dateFrom || query.dateTo) {
    where.paymentDate = {
      ...(query.dateFrom ? { gte: isoDateToUtc(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: isoDateToUtc(query.dateTo) } : {}),
    };
  }

  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    where.amount = {
      ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
      ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {}),
    };
  }

  if (query.search) {
    const term = query.search.trim();
    const digits = term.replace(/\D/g, '');

    const clientConditions: Prisma.ClientWhereInput[] = [
      { name: { contains: term, mode: 'insensitive' } },
      { companyName: { contains: term, mode: 'insensitive' } },
    ];

    // Busca por documento só entra se o termo tiver dígitos. O usuário digita
    // "123.456" com máscara; comparar o texto formatado contra a coluna limpa
    // nunca encontraria nada.
    if (digits.length > 0) {
      clientConditions.push({ cpfCnpj: { contains: digits } });
    }

    where.OR = [
      { notes: { contains: term, mode: 'insensitive' } },
      { invoice: { number: { contains: term, mode: 'insensitive' } } },
      { invoice: { client: { OR: clientConditions } } },
    ];
  }

  if (Object.keys(invoiceFilter).length > 0) {
    where.invoice = invoiceFilter;
  }

  return where;
}

export async function getPaymentById(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: PAYMENT_SELECT,
  });

  if (!payment) {
    throw AppError.notFound('Pagamento não encontrado.');
  }

  const referenceIso = today();

  /**
   * O detalhe traz também o contexto da fatura no momento da consulta: quanto
   * já foi pago ao todo e quanto ainda falta. Sem isso, quem abre um pagamento
   * de R$ 500 numa fatura de R$ 1.500 não sabe se aquilo quitou a cobrança ou
   * se era a primeira de três parcelas.
   */
  const siblings = await prisma.payment.findMany({
    where: { invoiceId: payment.invoice.id },
    select: { amount: true },
  });

  const invoiceCents = toCents(payment.invoice.amount);
  const paidCents = siblings.reduce((sum, item) => sum + toCents(item.amount), 0);

  return {
    ...toPaymentDto(payment, referenceIso),
    invoiceContext: {
      paidAmount: fromCents(paidCents),
      outstanding: fromCents(Math.max(invoiceCents - paidCents, 0)),
      paymentCount: siblings.length,
    },
  };
}

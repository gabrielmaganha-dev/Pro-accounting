import { InvoiceStatus, Prisma, type PaymentMethod } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/app-error.js';
import {
  addDays,
  addMonths,
  isoDateToUtc,
  monthLabel,
  startOfMonth,
  today,
  utcToIsoDate,
} from '../utils/date.js';
import { effectiveInvoiceStatus, fromCents, toCents } from '../utils/invoice-status.js';
import { toCsvFile } from '../reports/formatters/csv.js';
import { moneySummary } from '../reports/helpers.js';
import { toPdfFile } from '../reports/formatters/pdf.js';
import { toXlsxFile } from '../reports/formatters/xlsx.js';
import type {
  ReportColumn,
  ReportDocument,
  ReportFile,
  ReportFormat,
} from '../reports/types.js';
import type {
  FinanceEntriesQuery,
  FinanceExportQuery,
  FinanceOverviewQuery,
  FinancePeriod,
} from '../validators/finance.validator.js';

/**
 * Módulo financeiro — a visão consolidada do caixa do escritório.
 *
 * TUDO É CALCULADO AQUI. O frontend recebe números prontos e só os desenha.
 * Não é preciosismo: somar dinheiro em JavaScript significa somar em ponto
 * flutuante, e `0.1 + 0.2` já não fecha. No PostgreSQL a soma acontece em
 * `numeric`, aritmética exata, e atravessa o JSON como texto. O navegador
 * converte para número só na hora de definir a altura de uma barra, onde um
 * erro na 15ª casa decimal é irrelevante.
 *
 * O segundo motivo é mais simples: dois navegadores com relógios diferentes
 * discordariam sobre o que é "este mês" e sobre quais faturas estão atrasadas.
 * O recorte de período e a derivação de atraso são do servidor.
 */

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  OTHER: 'Outro',
};

/** Ordem fixa na legenda e no eixo — nunca a ordem em que o banco devolveu. */
const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  'PIX',
  'BOLETO',
  'TRANSFER',
  'CASH',
  'CARD',
  'OTHER',
];

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PAID: 'Pagas',
  PENDING: 'Pendentes',
  OVERDUE: 'Atrasadas',
  CANCELLED: 'Canceladas',
};

const ZERO = '0.00';

/**
 * Acima deste tamanho, a série temporal passa a agrupar por mês.
 *
 * Dois meses de barras diárias ainda são legíveis (~60 barras); um ano inteiro
 * viraria 365 traços grudados. O corte acontece no servidor para que o rótulo
 * do eixo — "12/mar" ou "mar/26" — venha coerente com o agrupamento, em vez de
 * o frontend adivinhar qual usar.
 */
const DAILY_GRANULARITY_MAX_DAYS = 62;

// ---------------------------------------------------------------------------
// Resolução do período
// ---------------------------------------------------------------------------

export interface ResolvedPeriod {
  period: FinancePeriod;
  from: string;
  to: string;
  label: string;
  /** Quantidade de dias no intervalo, inclusive as duas pontas. */
  days: number;
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Traduz o nome do período em um intervalo de datas concreto.
 *
 * "Semana" é a semana corrente começando na SEGUNDA, não os últimos sete dias.
 * Quem pergunta "quanto entrou esta semana" na sexta-feira quer o acumulado da
 * semana de trabalho, não uma janela móvel que inclui o sábado anterior.
 */
export function resolvePeriod(
  period: FinancePeriod,
  from?: string,
  to?: string,
): ResolvedPeriod {
  const reference = today();

  const build = (start: string, end: string, label: string): ResolvedPeriod => ({
    period,
    from: start,
    to: end,
    label,
    days: daysBetween(start, end) + 1,
  });

  switch (period) {
    case 'today':
      return build(reference, reference, `Hoje, ${formatBr(reference)}`);

    case 'week': {
      // getUTCDay: 0 = domingo. Recuar até a segunda-feira da semana corrente.
      const weekday = isoDateToUtc(reference).getUTCDay();
      const offsetToMonday = weekday === 0 ? 6 : weekday - 1;
      const monday = addDays(reference, -offsetToMonday);

      return build(monday, reference, `Semana de ${formatBr(monday)}`);
    }

    case 'month': {
      const start = startOfMonth(reference);
      return build(start, reference, monthName(reference));
    }

    case 'previous-month': {
      const start = addMonths(reference, -1);
      // Último dia do mês anterior = dia anterior ao primeiro do mês corrente.
      const end = addDays(startOfMonth(reference), -1);

      return build(start, end, monthName(start));
    }

    case 'year': {
      const start = `${reference.slice(0, 4)}-01-01`;
      return build(start, reference, `Ano de ${reference.slice(0, 4)}`);
    }

    case 'custom': {
      if (!from || !to) {
        throw AppError.validation('Informe as datas inicial e final do período.');
      }

      return build(from, to, `${formatBr(from)} a ${formatBr(to)}`);
    }
  }
}

function daysBetween(from: string, to: string): number {
  const diff = isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime();
  return Math.round(diff / 86_400_000);
}

function formatBr(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function monthName(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  return `${MONTH_NAMES[(month ?? 1) - 1]} de ${year}`;
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

interface TotalRow {
  total: string;
}

interface SeriesRow {
  bucket: string;
  total: string;
  count: number;
}

interface MethodRow {
  method: string;
  total: string;
  count: number;
}

interface StatusRow {
  status: string;
  count: number;
  amount: string;
  outstanding: string;
}

export async function getFinanceOverview(query: FinanceOverviewQuery) {
  const range = resolvePeriod(query.period, query.from, query.to);
  const reference = today();

  /**
   * As bordas vão ao SQL como STRING `YYYY-MM-DD`, nunca como `Date`.
   *
   * Não é estilo: a sessão do banco roda em America/Sao_Paulo, e um `Date` de
   * meia-noite UTC interpolado num `::date` é convertido para o fuso local —
   * `2026-09-21T00:00:00Z` vira `2026-09-20`. O período perderia o dia de hoje
   * inteiro, e "receita do mês" apareceria zerada numa manhã de movimento.
   * Com string, o cast acontece entre dois dias de calendário, sem conversão
   * nenhuma pelo caminho. É a mesma convenção do painel e do resumo de
   * faturas, documentada em utils/date.ts.
   */
  const periodStart = range.from;
  const periodEnd = range.to;

  const monthStart = startOfMonth(reference);
  const yearStart = `${reference.slice(0, 4)}-01-01`;

  const byDay = range.days <= DAILY_GRANULARITY_MAX_DAYS;

  const [
    receivedInPeriod,
    receivedThisMonth,
    receivedThisYear,
    invoicedInPeriod,
    balanceRows,
    seriesRows,
    methodRows,
    statusRows,
  ] = await prisma.$transaction([
    // --- Recebido no período selecionado -----------------------------------
    prisma.$queryRaw<TotalRow[]>`
      SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total
      FROM payments
      WHERE payment_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
    `,

    // --- Receita do mês corrente (fixa, não segue o filtro) ----------------
    prisma.$queryRaw<TotalRow[]>`
      SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total
      FROM payments
      WHERE payment_date BETWEEN ${monthStart}::date AND ${reference}::date
    `,

    // --- Receita do ano corrente (fixa) ------------------------------------
    prisma.$queryRaw<TotalRow[]>`
      SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total
      FROM payments
      WHERE payment_date BETWEEN ${yearStart}::date AND ${reference}::date
    `,

    /**
     * Total faturado no período — pela data de EMISSÃO, e sem as canceladas.
     *
     * Fatura cancelada não é receita nem dívida: foi emitida por engano ou o
     * serviço não aconteceu. Incluí-la inflaria o faturamento com valor que
     * ninguém jamais vai cobrar.
     */
    prisma.$queryRaw<TotalRow[]>`
      SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total
      FROM invoices
      WHERE status <> 'CANCELLED'
        AND issue_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
    `,

    /**
     * Saldos em aberto — SEMPRE a posição de hoje, nunca recortada pelo
     * período.
     *
     * "Atrasado" quer dizer "vencido até hoje e ainda não pago". Recortar por
     * período produziria "o que venceu em março e continua atrasado", que é
     * outro número e não o que se pergunta ao abrir a tela. Os dois cards
     * dizem isso explicitamente na interface.
     */
    prisma.$queryRaw<StatusRow[]>`
      WITH paid AS (
        SELECT invoice_id, SUM(amount) AS total
        FROM payments
        GROUP BY invoice_id
      )
      SELECT
        CASE
          WHEN i.status = 'PENDING' AND i.due_date < ${reference}::date THEN 'OVERDUE'
          ELSE i.status::text
        END AS status,
        COUNT(*)::int AS count,
        COALESCE(SUM(i.amount), 0)::numeric(14,2)::text AS amount,
        COALESCE(SUM(GREATEST(i.amount - COALESCE(p.total, 0), 0)), 0)::numeric(14,2)::text AS outstanding
      FROM invoices i
      LEFT JOIN paid p ON p.invoice_id = i.id
      GROUP BY 1
    `,

    /**
     * Série temporal da receita, por dia ou por mês conforme o intervalo.
     *
     * `date_trunc` decide o agrupamento; o `CASE` escolhe qual usar. Fazer as
     * duas consultas e descartar uma seria trabalho dobrado no banco.
     */
    byDay
      ? prisma.$queryRaw<SeriesRow[]>`
          SELECT
            to_char(payment_date, 'YYYY-MM-DD') AS bucket,
            COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total,
            COUNT(*)::int AS count
          FROM payments
          WHERE payment_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
          GROUP BY 1
          ORDER BY 1
        `
      : prisma.$queryRaw<SeriesRow[]>`
          SELECT
            to_char(date_trunc('month', payment_date), 'YYYY-MM') AS bucket,
            COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total,
            COUNT(*)::int AS count
          FROM payments
          WHERE payment_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
          GROUP BY 1
          ORDER BY 1
        `,

    // --- Recebimentos por forma de pagamento, no período -------------------
    prisma.$queryRaw<MethodRow[]>`
      SELECT
        payment_method::text AS method,
        COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total,
        COUNT(*)::int AS count
      FROM payments
      WHERE payment_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
      GROUP BY 1
    `,

    /**
     * Faturas EMITIDAS no período, pela situação em que estão hoje.
     *
     * O recorte é por emissão para o gráfico responder "do que emitimos neste
     * período, quanto já foi pago" — a pergunta que liga esforço de cobrança a
     * resultado.
     */
    prisma.$queryRaw<StatusRow[]>`
      WITH paid AS (
        SELECT invoice_id, SUM(amount) AS total
        FROM payments
        GROUP BY invoice_id
      )
      SELECT
        CASE
          WHEN i.status = 'PENDING' AND i.due_date < ${reference}::date THEN 'OVERDUE'
          ELSE i.status::text
        END AS status,
        COUNT(*)::int AS count,
        COALESCE(SUM(i.amount), 0)::numeric(14,2)::text AS amount,
        COALESCE(SUM(GREATEST(i.amount - COALESCE(p.total, 0), 0)), 0)::numeric(14,2)::text AS outstanding
      FROM invoices i
      LEFT JOIN paid p ON p.invoice_id = i.id
      WHERE i.issue_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
      GROUP BY 1
    `,
  ]);

  const balances = new Map(balanceRows.map((row) => [row.status, row]));

  return {
    period: range,
    granularity: byDay ? ('day' as const) : ('month' as const),

    cards: {
      /** Receita do mês corrente — independente do filtro. */
      revenueThisMonth: receivedThisMonth[0]?.total ?? ZERO,
      /** Receita do ano corrente — independente do filtro. */
      revenueThisYear: receivedThisYear[0]?.total ?? ZERO,
      /** Recebido dentro do período selecionado. */
      received: receivedInPeriod[0]?.total ?? ZERO,
      /** Emitido dentro do período selecionado, exceto canceladas. */
      invoiced: invoicedInPeriod[0]?.total ?? ZERO,
      /** Saldo em aberto de faturas no prazo — posição de hoje. */
      pending: balances.get('PENDING')?.outstanding ?? ZERO,
      /** Saldo em aberto de faturas vencidas — posição de hoje. */
      overdue: balances.get('OVERDUE')?.outstanding ?? ZERO,
      pendingCount: balances.get('PENDING')?.count ?? 0,
      overdueCount: balances.get('OVERDUE')?.count ?? 0,
    },

    revenueSeries: fillSeries(seriesRows, range, byDay),

    receiptsByMethod: PAYMENT_METHOD_ORDER.map((method) => {
      const row = methodRows.find((item) => item.method === method);

      return {
        method,
        label: PAYMENT_METHOD_LABELS[method],
        total: row?.total ?? ZERO,
        count: row?.count ?? 0,
      };
    }).filter((item) => item.count > 0),

    invoicesByStatus: ['PAID', 'PENDING', 'OVERDUE'].map((status) => {
      const row = statusRows.find((item) => item.status === status);

      return {
        status,
        label: INVOICE_STATUS_LABELS[status] ?? status,
        count: row?.count ?? 0,
        amount: row?.amount ?? ZERO,
        outstanding: row?.outstanding ?? ZERO,
      };
    }),
  };
}

/**
 * Completa os intervalos sem movimento.
 *
 * Um `GROUP BY` só devolve períodos que TÊM registro. Um gráfico de doze meses
 * precisa mostrar também os meses zerados — senão um mês sem recebimento
 * simplesmente some do eixo, e o gráfico passa a mentir sobre o intervalo que
 * está representando.
 */
function fillSeries(rows: SeriesRow[], range: ResolvedPeriod, byDay: boolean) {
  const found = new Map(rows.map((row) => [row.bucket, row]));
  const points: { bucket: string; label: string; total: string; count: number }[] = [];

  if (byDay) {
    let cursor = range.from;

    while (cursor <= range.to) {
      const row = found.get(cursor);
      const [, month, day] = cursor.split('-');

      points.push({
        bucket: cursor,
        label: `${day}/${month}`,
        total: row?.total ?? ZERO,
        count: row?.count ?? 0,
      });

      cursor = addDays(cursor, 1);
    }

    return points;
  }

  let cursor = startOfMonth(range.from);
  const lastMonth = range.to.slice(0, 7);

  while (cursor.slice(0, 7) <= lastMonth) {
    const key = cursor.slice(0, 7);
    const row = found.get(key);

    points.push({
      bucket: key,
      label: monthLabel(key),
      total: row?.total ?? ZERO,
      count: row?.count ?? 0,
    });

    cursor = addMonths(cursor, 1);
  }

  return points;
}

// ---------------------------------------------------------------------------
// Tabela de lançamentos
// ---------------------------------------------------------------------------

function buildEntriesWhere(
  query: { status?: string; clientId?: string },
  range: ResolvedPeriod,
  reference: string,
): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {
    issueDate: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
  };

  if (query.clientId) where.clientId = query.clientId;

  const referenceDate = isoDateToUtc(reference);

  // Mesma tradução de ATRASADA usada no módulo de faturas: o status não existe
  // na coluna, e PENDENTE precisa excluir as vencidas para não contar duas vezes.
  if (query.status === 'OVERDUE') {
    where.status = InvoiceStatus.PENDING;
    where.dueDate = { lt: referenceDate };
  } else if (query.status === 'PENDING') {
    where.status = InvoiceStatus.PENDING;
    where.dueDate = { gte: referenceDate };
  } else if (query.status) {
    where.status = query.status as InvoiceStatus;
  }

  return where;
}

const ENTRY_SELECT = {
  id: true,
  number: true,
  amount: true,
  issueDate: true,
  dueDate: true,
  status: true,
  client: { select: { id: true, name: true, cpfCnpj: true } },
  contract: { select: { id: true, number: true } },
  payments: { select: { amount: true, paymentDate: true, paymentMethod: true } },
} as const;

type EntryRow = Prisma.InvoiceGetPayload<{ select: typeof ENTRY_SELECT }>;

function toEntryDto(invoice: EntryRow, reference: string) {
  const amountCents = toCents(invoice.amount);
  const paidCents = invoice.payments.reduce((sum, item) => sum + toCents(item.amount), 0);

  const lastPayment = invoice.payments.reduce<{ date: string; method: string } | null>(
    (latest, item) => {
      const date = utcToIsoDate(item.paymentDate);
      if (latest === null || date > latest.date) return { date, method: item.paymentMethod };
      return latest;
    },
    null,
  );

  const dueDate = utcToIsoDate(invoice.dueDate);

  return {
    id: invoice.id,
    number: invoice.number,
    clientId: invoice.client.id,
    clientName: invoice.client.name,
    clientDocument: invoice.client.cpfCnpj,
    contractNumber: invoice.contract?.number ?? null,
    amount: invoice.amount.toFixed(2),
    paidAmount: fromCents(paidCents),
    outstanding: fromCents(Math.max(amountCents - paidCents, 0)),
    issueDate: utcToIsoDate(invoice.issueDate),
    dueDate,
    paymentDate: lastPayment?.date ?? null,
    paymentMethod: lastPayment ? PAYMENT_METHOD_LABELS[lastPayment.method as PaymentMethod] : null,
    status: effectiveInvoiceStatus(invoice.status, dueDate, reference),
  };
}

export async function getFinanceEntries(query: FinanceEntriesQuery) {
  const range = resolvePeriod(query.period, query.from, query.to);
  const reference = today();
  const where = buildEntriesWhere(query, range, reference);

  const orderBy: Prisma.InvoiceOrderByWithRelationInput =
    query.sort === 'client' ? { client: { name: query.order } } : { [query.sort]: query.order };

  const [total, items, aggregate] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ENTRY_SELECT,
    }),
    prisma.invoice.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    items: items.map((invoice) => toEntryDto(invoice, reference)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    /** Soma de TODAS as faturas do filtro, não só as da página. */
    totalAmount: aggregate._sum.amount ? aggregate._sum.amount.toFixed(2) : ZERO,
    period: range,
  };
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export type ExportResult = ReportFile;

/**
 * Colunas da exportação financeira, no vocabulário do núcleo de relatórios.
 *
 * O `kind` é o que permite ao mesmo descritor servir aos três formatos: o CSV
 * formata em pt-BR, o Excel grava número de verdade para a coluna somar, e o
 * PDF alinha à direita. Antes isto era uma lista de cabeçalhos soltos e uma
 * função que montava strings — que funcionava só para CSV.
 */
const FINANCE_EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'clientName', label: 'Cliente', kind: 'text', width: 24 },
  { key: 'clientDocument', label: 'CPF/CNPJ', kind: 'text', width: 13 },
  { key: 'number', label: 'Fatura', kind: 'text', width: 13 },
  { key: 'contractNumber', label: 'Contrato', kind: 'text', width: 11 },
  { key: 'issueDate', label: 'Emissão', kind: 'date', width: 9 },
  { key: 'dueDate', label: 'Vencimento', kind: 'date', width: 9 },
  { key: 'amount', label: 'Valor', kind: 'money', width: 11 },
  { key: 'paidAmount', label: 'Recebido', kind: 'money', width: 11 },
  { key: 'outstanding', label: 'Em aberto', kind: 'money', width: 11 },
  { key: 'paymentDate', label: 'Pagamento', kind: 'date', width: 9 },
  { key: 'paymentMethod', label: 'Forma', kind: 'text', width: 11 },
  { key: 'statusLabel', label: 'Situação', kind: 'text', width: 10 },
];

const EXPORT_WRITERS: Record<ReportFormat, typeof toCsvFile> = {
  csv: toCsvFile,
  xlsx: toXlsxFile,
  pdf: toPdfFile,
};

/**
 * Exporta os lançamentos do período nos três formatos.
 *
 * A serialização vive em `reports/formatters/`, compartilhada com os
 * relatórios. Esta função não sabe o que é um CSV nem um PDF — monta um
 * `ReportDocument` e entrega ao formatador escolhido. Foi assim que o Excel e
 * o PDF, que aqui respondiam 501, passaram a funcionar sem uma linha de
 * serialização nova neste arquivo.
 */
export async function exportFinanceEntries(query: FinanceExportQuery): Promise<ExportResult> {

  const range = resolvePeriod(query.period, query.from, query.to);
  const reference = today();
  const where = buildEntriesWhere(query, range, reference);

  /**
   * Teto de 5.000 linhas.
   *
   * Sem limite, exportar "o ano todo" de um escritório grande montaria a
   * planilha inteira em memória e seguraria a conexão do banco enquanto isso.
   * O recado pede para estreitar o período, que é o que a pessoa faria de
   * qualquer forma para trabalhar no arquivo.
   */
  const total = await prisma.invoice.count({ where });

  if (total > 5000) {
    throw AppError.validation(
      `O período selecionado tem ${total} faturas, acima do limite de 5.000 por exportação. ` +
        'Estreite o período ou filtre por situação.',
    );
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { dueDate: 'asc' },
    select: ENTRY_SELECT,
  });

  const entries = invoices.map((invoice) => toEntryDto(invoice, reference));

  const billedCents = entries.reduce((sum, entry) => sum + toCents(entry.amount), 0);
  const receivedCents = entries.reduce((sum, entry) => sum + toCents(entry.paidAmount), 0);

  const document: ReportDocument = {
    title: 'Financeiro — lançamentos do período',
    subtitle: `${range.label} · ${total} ${total === 1 ? 'fatura' : 'faturas'}`,
    columns: FINANCE_EXPORT_COLUMNS,
    rows: entries.map((entry) => ({
      clientName: entry.clientName,
      clientDocument: entry.clientDocument,
      number: entry.number,
      contractNumber: entry.contractNumber,
      issueDate: entry.issueDate,
      dueDate: entry.dueDate,
      amount: entry.amount,
      paidAmount: entry.paidAmount,
      outstanding: entry.outstanding,
      paymentDate: entry.paymentDate,
      paymentMethod: entry.paymentMethod,
      statusLabel: INVOICE_STATUS_LABELS[entry.status] ?? entry.status,
    })),
    summary: [
      // Mesmo formato dos relatórios (R$ 1.234,56): com `fromCents` puro o
      // resumo saía como "R$ 1234.56", com ponto decimal, no arquivo pt-BR.
      moneySummary('Faturado', fromCents(billedCents)),
      moneySummary('Recebido', fromCents(receivedCents)),
      moneySummary('Em aberto', fromCents(Math.max(billedCents - receivedCents, 0))),
    ],
    generatedAt: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(new Date())
      .replace(',', ' às'),
  };

  // A anotação é necessária porque o wrapper de validação do período usa
  // genéricos e o TypeScript perde o tipo literal do enum no caminho. O valor
  // em si é garantido pelo `z.enum` do schema.
  const writer = EXPORT_WRITERS[query.format as ReportFormat];

  return writer(document, `financeiro-${range.from}-a-${range.to}`);
}


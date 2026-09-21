import type { ContractStatus } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type {
  AlertContractItem,
  AlertInvoiceItem,
  ContractStatusSlice,
  DashboardResponse,
  EffectiveInvoiceStatus,
  InvoiceStatusSlice,
  MonthlyRevenuePoint,
  NewClientsPoint,
} from '../types/dashboard.js';
import {
  APP_TIME_ZONE,
  CHART_MONTHS,
  CONTRACT_EXPIRY_WINDOW_DAYS,
  INVOICE_DUE_SOON_WINDOW_DAYS,
  addDays,
  addMonths,
  lastMonthKeys,
  monthLabel,
  startOfMonth,
  today,
} from '../utils/date.js';

// ---------------------------------------------------------------------------
// Rótulos em português
// ---------------------------------------------------------------------------
// Os enums são gravados em inglês no banco. A tradução acontece aqui, no
// backend, porque estes rótulos vão direto para a legenda dos gráficos — e
// duplicá-los no frontend criaria duas listas para manter em sincronia.

const INVOICE_STATUS_LABELS: Record<EffectiveInvoiceStatus, string> = {
  PAID: 'Pagas',
  PENDING: 'Pendentes',
  OVERDUE: 'Atrasadas',
  CANCELLED: 'Canceladas',
};

const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Ativos',
  PENDING: 'Pendentes',
  RENEWAL: 'Em renovação',
  CLOSED: 'Encerrados',
  CANCELLED: 'Cancelados',
};

const ZERO = '0.00';
const MAX_ALERT_ITEMS = 5;
const MAX_ACTIVITY_ITEMS = 5;

// ---------------------------------------------------------------------------
// Formatos das linhas devolvidas pelas consultas SQL
// ---------------------------------------------------------------------------

interface StatusCountRow {
  status: string;
  count: number;
}

interface InvoiceAggregateRow {
  status: string;
  count: number;
  /** Valor de face somado. */
  amount: string;
  /** Saldo em aberto: valor de face menos pagamentos já registrados. */
  outstanding: string;
}

interface CountRow {
  count: number;
}

interface TotalRow {
  total: string;
}

interface MonthlyRevenueRow {
  month: string;
  total: string;
  count: number;
}

interface MonthlyCountRow {
  month: string;
  count: number;
}

interface PendingBucketRow {
  bucket: string;
  count: number;
  amount: string;
}

interface AlertInvoiceRow {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  amount: string;
  dueDate: string;
  daysOverdue: number;
  bucket: string;
}

/**
 * Monta todos os dados do painel.
 *
 * REGRA CENTRAL DESTE MÓDULO — a derivação de ATRASADO:
 *
 *   status efetivo = PENDING e due_date < hoje  ->  OVERDUE
 *                    caso contrário             ->  o status gravado
 *
 * `OVERDUE` NUNCA é gravado na coluna `invoices.status`. Uma fatura se torna
 * atrasada pela simples passagem do tempo, sem ninguém agir sobre ela. Se o
 * status ficasse armazenado, ele estaria errado todos os dias até alguém rodar
 * uma rotina de atualização — e bastaria essa rotina falhar num fim de semana
 * para o painel mentir. Derivando na consulta, o número está sempre certo, e o
 * custo é um índice em (status, due_date), que já existe desde a Etapa 1.
 *
 * Todas as consultas rodam dentro de uma única transação para que os cards, os
 * gráficos e os alertas reflitam exatamente o mesmo instante do banco. Sem
 * isso, um pagamento registrado no meio da montagem apareceria na receita mas
 * não no total recebido, e os números do painel não fechariam entre si.
 */
export async function getDashboard(timeZone: string = APP_TIME_ZONE): Promise<DashboardResponse> {
  const referenceDate = today(timeZone);
  const contractExpiryLimit = addDays(referenceDate, CONTRACT_EXPIRY_WINDOW_DAYS);
  const invoiceDueSoonLimit = addDays(referenceDate, INVOICE_DUE_SOON_WINDOW_DAYS);
  const chartRangeStart = addMonths(startOfMonth(referenceDate), -(CHART_MONTHS - 1));

  const [
    clientStatusRows,
    contractStatusRows,
    expiringContractCountRows,
    invoiceAggregateRows,
    receivedRows,
    monthlyRevenueRows,
    newClientsRows,
    pendingBucketRows,
    alertInvoiceRows,
    expiringContractRows,
    recentClients,
    recentContracts,
    recentInvoices,
    recentPayments,
  ] = await prisma.$transaction([
    // --- Clientes por situação -------------------------------------------
    prisma.$queryRaw<StatusCountRow[]>`
      SELECT status::text AS status, COUNT(*)::int AS count
      FROM clients
      GROUP BY 1
    `,

    // --- Contratos por situação ------------------------------------------
    prisma.$queryRaw<StatusCountRow[]>`
      SELECT status::text AS status, COUNT(*)::int AS count
      FROM contracts
      GROUP BY 1
    `,

    // --- Contratos vencendo na janela de alerta --------------------------
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::int AS count
      FROM contracts
      WHERE status = 'ACTIVE'
        AND end_date IS NOT NULL
        AND end_date >= ${referenceDate}::date
        AND end_date <= ${contractExpiryLimit}::date
    `,

    // --- Faturas por status efetivo --------------------------------------
    // `outstanding` desconta pagamentos parciais: uma fatura de R$ 1.000 com
    // R$ 400 já pagos pesa R$ 600 no "a receber", não R$ 1.000.
    // GREATEST(..., 0) protege contra pagamento a maior virar valor negativo.
    prisma.$queryRaw<InvoiceAggregateRow[]>`
      WITH paid AS (
        SELECT invoice_id, SUM(amount) AS total
        FROM payments
        GROUP BY invoice_id
      )
      SELECT
        CASE
          WHEN i.status = 'PENDING' AND i.due_date < ${referenceDate}::date THEN 'OVERDUE'
          ELSE i.status::text
        END AS status,
        COUNT(*)::int AS count,
        COALESCE(SUM(i.amount), 0)::numeric(14,2)::text AS amount,
        COALESCE(SUM(GREATEST(i.amount - COALESCE(p.total, 0), 0)), 0)::numeric(14,2)::text AS outstanding
      FROM invoices i
      LEFT JOIN paid p ON p.invoice_id = i.id
      GROUP BY 1
    `,

    // --- Total efetivamente recebido --------------------------------------
    // Soma dos PAGAMENTOS, não das faturas marcadas como pagas. É o dinheiro
    // que de fato entrou, e é o único número que fecha com o extrato bancário.
    prisma.$queryRaw<TotalRow[]>`
      SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total
      FROM payments
    `,

    // --- Receita mensal (últimos 12 meses) --------------------------------
    prisma.$queryRaw<MonthlyRevenueRow[]>`
      SELECT
        to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
        COALESCE(SUM(amount), 0)::numeric(14,2)::text AS total,
        COUNT(*)::int AS count
      FROM payments
      WHERE payment_date >= ${chartRangeStart}::date
      GROUP BY 1
      ORDER BY 1
    `,

    // --- Clientes novos por mês -------------------------------------------
    // `created_at` é timestamp sem fuso guardando UTC. A dupla conversão
    // reposiciona o instante no fuso do escritório antes de agrupar: sem ela,
    // um cliente cadastrado às 22h do dia 31 cairia no mês seguinte.
    prisma.$queryRaw<MonthlyCountRow[]>`
      SELECT
        to_char(
          date_trunc('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}),
          'YYYY-MM'
        ) AS month,
        COUNT(*)::int AS count
      FROM clients
      WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}) >= ${chartRangeStart}::date
      GROUP BY 1
      ORDER BY 1
    `,

    // --- Faturas pendentes classificadas por proximidade do vencimento ----
    prisma.$queryRaw<PendingBucketRow[]>`
      WITH paid AS (
        SELECT invoice_id, SUM(amount) AS total
        FROM payments
        GROUP BY invoice_id
      )
      SELECT
        CASE
          WHEN i.due_date < ${referenceDate}::date THEN 'OVERDUE'
          WHEN i.due_date = ${referenceDate}::date THEN 'DUE_TODAY'
          WHEN i.due_date <= ${invoiceDueSoonLimit}::date THEN 'DUE_SOON'
          ELSE 'LATER'
        END AS bucket,
        COUNT(*)::int AS count,
        COALESCE(SUM(GREATEST(i.amount - COALESCE(p.total, 0), 0)), 0)::numeric(14,2)::text AS amount
      FROM invoices i
      LEFT JOIN paid p ON p.invoice_id = i.id
      WHERE i.status = 'PENDING'
      GROUP BY 1
    `,

    // --- Itens dos alertas de fatura --------------------------------------
    // Uma única consulta devolve os três grupos. ROW_NUMBER particionado por
    // grupo limita a 5 itens CADA um — um LIMIT simples devolveria 5 no total
    // e um grupo poderia comer a cota dos outros.
    prisma.$queryRaw<AlertInvoiceRow[]>`
      WITH paid AS (
        SELECT invoice_id, SUM(amount) AS total
        FROM payments
        GROUP BY invoice_id
      ),
      classified AS (
        SELECT
          i.id,
          i.number,
          i.client_id,
          c.name AS client_name,
          GREATEST(i.amount - COALESCE(p.total, 0), 0) AS outstanding,
          i.due_date,
          (${referenceDate}::date - i.due_date)::int AS days_overdue,
          CASE
            WHEN i.due_date < ${referenceDate}::date THEN 'OVERDUE'
            WHEN i.due_date = ${referenceDate}::date THEN 'DUE_TODAY'
            WHEN i.due_date <= ${invoiceDueSoonLimit}::date THEN 'DUE_SOON'
            ELSE 'LATER'
          END AS bucket
        FROM invoices i
        JOIN clients c ON c.id = i.client_id
        LEFT JOIN paid p ON p.invoice_id = i.id
        WHERE i.status = 'PENDING'
      ),
      ranked AS (
        SELECT
          classified.*,
          ROW_NUMBER() OVER (
            PARTITION BY bucket
            ORDER BY due_date ASC, outstanding DESC
          ) AS rn
        FROM classified
        WHERE bucket <> 'LATER'
      )
      SELECT
        id,
        number,
        client_id AS "clientId",
        client_name AS "clientName",
        outstanding::numeric(14,2)::text AS amount,
        to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
        days_overdue AS "daysOverdue",
        bucket
      FROM ranked
      WHERE rn <= ${MAX_ALERT_ITEMS}
      ORDER BY bucket, due_date ASC
    `,

    // --- Itens do alerta de contratos --------------------------------------
    prisma.$queryRaw<AlertContractItem[]>`
      SELECT
        ct.id,
        ct.number,
        ct.client_id AS "clientId",
        c.name AS "clientName",
        to_char(ct.end_date, 'YYYY-MM-DD') AS "endDate",
        (ct.end_date - ${referenceDate}::date)::int AS "daysUntilExpiry",
        ct.monthly_value::numeric(14,2)::text AS "monthlyValue"
      FROM contracts ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.status = 'ACTIVE'
        AND ct.end_date IS NOT NULL
        AND ct.end_date >= ${referenceDate}::date
        AND ct.end_date <= ${contractExpiryLimit}::date
      ORDER BY ct.end_date ASC
      LIMIT ${MAX_ALERT_ITEMS}
    `,

    // --- Atividade recente -------------------------------------------------
    // Aqui o Prisma é preferível ao SQL cru: são leituras simples e o retorno
    // já vem tipado, sem precisar declarar o formato da linha na mão.
    prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVITY_ITEMS,
      select: { id: true, name: true, cpfCnpj: true, createdAt: true },
    }),

    prisma.contract.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVITY_ITEMS,
      select: {
        id: true,
        number: true,
        monthlyValue: true,
        status: true,
        createdAt: true,
        clientId: true,
        client: { select: { name: true } },
      },
    }),

    prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVITY_ITEMS,
      select: {
        id: true,
        number: true,
        amount: true,
        status: true,
        dueDate: true,
        createdAt: true,
        clientId: true,
        client: { select: { name: true } },
      },
    }),

    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVITY_ITEMS,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        createdAt: true,
        invoiceId: true,
        invoice: {
          select: { number: true, client: { select: { name: true } } },
        },
        user: { select: { name: true } },
      },
    }),
  ]);

  // -------------------------------------------------------------------------
  // Cards
  // -------------------------------------------------------------------------

  const clientCounts = toCountMap(clientStatusRows);
  const contractCounts = toCountMap(contractStatusRows);
  const invoiceByStatus = new Map(invoiceAggregateRows.map((row) => [row.status, row]));
  const pendingBuckets = new Map(pendingBucketRows.map((row) => [row.bucket, row]));

  const clientsTotal = sumCounts(clientStatusRows);
  const contractsTotal = sumCounts(contractStatusRows);
  const invoicesTotal = invoiceAggregateRows.reduce((total, row) => total + row.count, 0);

  const cards: DashboardResponse['cards'] = {
    clients: {
      total: clientsTotal,
      active: clientCounts.get('ACTIVE') ?? 0,
      inactive: clientCounts.get('INACTIVE') ?? 0,
    },
    contracts: {
      total: contractsTotal,
      active: contractCounts.get('ACTIVE') ?? 0,
      closed: contractCounts.get('CLOSED') ?? 0,
      cancelled: contractCounts.get('CANCELLED') ?? 0,
      expiringSoon: expiringContractCountRows[0]?.count ?? 0,
    },
    invoices: {
      total: invoicesTotal,
      paid: invoiceByStatus.get('PAID')?.count ?? 0,
      pending: invoiceByStatus.get('PENDING')?.count ?? 0,
      overdue: invoiceByStatus.get('OVERDUE')?.count ?? 0,
      cancelled: invoiceByStatus.get('CANCELLED')?.count ?? 0,
    },
    amounts: {
      received: receivedRows[0]?.total ?? ZERO,
      pending: invoiceByStatus.get('PENDING')?.outstanding ?? ZERO,
      overdue: invoiceByStatus.get('OVERDUE')?.outstanding ?? ZERO,
    },
  };

  // -------------------------------------------------------------------------
  // Gráficos
  // -------------------------------------------------------------------------

  const monthKeys = lastMonthKeys(referenceDate, CHART_MONTHS);
  const revenueByMonth = new Map(monthlyRevenueRows.map((row) => [row.month, row]));
  const clientsByMonth = new Map(newClientsRows.map((row) => [row.month, row.count]));

  // Os meses sem registro precisam aparecer com zero: um GROUP BY só devolve
  // meses que têm linhas, e um gráfico com buracos distorce a leitura da série.
  const monthlyRevenue: MonthlyRevenuePoint[] = monthKeys.map((month) => ({
    month,
    label: monthLabel(month),
    total: revenueByMonth.get(month)?.total ?? ZERO,
    paymentCount: revenueByMonth.get(month)?.count ?? 0,
  }));

  const newClientsByMonth: NewClientsPoint[] = monthKeys.map((month) => ({
    month,
    label: monthLabel(month),
    count: clientsByMonth.get(month) ?? 0,
  }));

  const invoiceStatusOrder: EffectiveInvoiceStatus[] = ['PAID', 'PENDING', 'OVERDUE', 'CANCELLED'];

  const invoicesByStatus: InvoiceStatusSlice[] = invoiceStatusOrder.map((status) => ({
    status,
    label: INVOICE_STATUS_LABELS[status],
    count: invoiceByStatus.get(status)?.count ?? 0,
    amount: invoiceByStatus.get(status)?.amount ?? ZERO,
    outstanding: invoiceByStatus.get(status)?.outstanding ?? ZERO,
  }));

  const contractStatusOrder: ContractStatus[] = [
    'ACTIVE',
    'PENDING',
    'RENEWAL',
    'CLOSED',
    'CANCELLED',
  ];

  const contractsByStatus: ContractStatusSlice[] = contractStatusOrder.map((status) => ({
    status,
    label: CONTRACT_STATUS_LABELS[status],
    count: contractCounts.get(status) ?? 0,
  }));

  // -------------------------------------------------------------------------
  // Alertas
  // -------------------------------------------------------------------------

  const alertItemsByBucket = groupAlertItems(alertInvoiceRows);

  const alerts: DashboardResponse['alerts'] = {
    overdueInvoices: {
      count: pendingBuckets.get('OVERDUE')?.count ?? 0,
      amount: pendingBuckets.get('OVERDUE')?.amount ?? ZERO,
      items: alertItemsByBucket.get('OVERDUE') ?? [],
    },
    dueTodayInvoices: {
      count: pendingBuckets.get('DUE_TODAY')?.count ?? 0,
      amount: pendingBuckets.get('DUE_TODAY')?.amount ?? ZERO,
      items: alertItemsByBucket.get('DUE_TODAY') ?? [],
    },
    dueSoonInvoices: {
      count: pendingBuckets.get('DUE_SOON')?.count ?? 0,
      amount: pendingBuckets.get('DUE_SOON')?.amount ?? ZERO,
      items: alertItemsByBucket.get('DUE_SOON') ?? [],
    },
    expiringContracts: {
      count: cards.contracts.expiringSoon,
      items: expiringContractRows,
    },
  };

  // -------------------------------------------------------------------------
  // Atividade recente
  // -------------------------------------------------------------------------

  const recentActivity: DashboardResponse['recentActivity'] = {
    clients: recentClients.map((client) => ({
      id: client.id,
      name: client.name,
      cpfCnpj: client.cpfCnpj,
      createdAt: client.createdAt.toISOString(),
    })),

    contracts: recentContracts.map((contract) => ({
      id: contract.id,
      number: contract.number,
      clientId: contract.clientId,
      clientName: contract.client.name,
      monthlyValue: contract.monthlyValue.toFixed(2),
      status: contract.status,
      createdAt: contract.createdAt.toISOString(),
    })),

    invoices: recentInvoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      clientId: invoice.clientId,
      clientName: invoice.client.name,
      amount: invoice.amount.toFixed(2),
      // Mesma derivação de ATRASADO aplicada aos cards, para a lista não
      // contradizer o número exibido logo acima dela.
      status: resolveEffectiveStatus(invoice.status, invoice.dueDate, referenceDate),
      createdAt: invoice.createdAt.toISOString(),
    })),

    payments: recentPayments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice.number,
      clientName: payment.invoice.client.name,
      amount: payment.amount.toFixed(2),
      paymentMethod: payment.paymentMethod,
      registeredByName: payment.user.name,
      createdAt: payment.createdAt.toISOString(),
    })),
  };

  return {
    generatedAt: new Date().toISOString(),
    referenceDate,
    cards,
    charts: {
      monthlyRevenue,
      invoicesByStatus,
      newClientsByMonth,
      contractsByStatus,
    },
    alerts,
    recentActivity,
  };
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function toCountMap(rows: StatusCountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.status, row.count]));
}

function sumCounts(rows: StatusCountRow[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

function groupAlertItems(rows: AlertInvoiceRow[]): Map<string, AlertInvoiceItem[]> {
  const grouped = new Map<string, AlertInvoiceItem[]>();

  for (const row of rows) {
    const items = grouped.get(row.bucket) ?? [];

    items.push({
      id: row.id,
      number: row.number,
      clientId: row.clientId,
      clientName: row.clientName,
      amount: row.amount,
      dueDate: row.dueDate,
      daysOverdue: row.daysOverdue,
    });

    grouped.set(row.bucket, items);
  }

  return grouped;
}

/**
 * Aplica a derivação de ATRASADO a uma fatura individual.
 *
 * `dueDate` vem do Prisma como Date à meia-noite UTC (a coluna é DATE), então
 * comparar as representações `YYYY-MM-DD` é seguro e não envolve fuso.
 */
function resolveEffectiveStatus(
  status: string,
  dueDate: Date,
  referenceDate: string,
): EffectiveInvoiceStatus {
  if (status === 'PENDING' && dueDate.toISOString().slice(0, 10) < referenceDate) {
    return 'OVERDUE';
  }

  return status as EffectiveInvoiceStatus;
}

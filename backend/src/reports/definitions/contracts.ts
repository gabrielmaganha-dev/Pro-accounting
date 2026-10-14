import { ContractStatus, type Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { CONTRACT_EXPIRY_WINDOW_DAYS, addDays, today, utcToIsoDate } from '../../utils/date.js';
import { countSummary, dateRange, daysBetween, decimalToString, moneySummary } from '../helpers.js';
import type { ReportDefinition, ReportFilters, ReportResult } from '../types.js';

/**
 * Relatórios de contratos.
 *
 * "Vencendo" NÃO é uma situação gravada no banco — é um contrato ativo cujo
 * término cai nos próximos 30 dias. A janela vem de
 * `CONTRACT_EXPIRY_WINDOW_DAYS`, a MESMA constante usada pelos alertas do
 * painel e pelo sino de notificações. Um número próprio aqui faria o relatório
 * discordar do alerta que levou a pessoa a abri-lo.
 */

const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Ativo',
  PENDING: 'Pendente',
  RENEWAL: 'Em renovação',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

const SELECT = {
  id: true,
  number: true,
  serviceType: true,
  monthlyValue: true,
  dueDay: true,
  startDate: true,
  endDate: true,
  status: true,
  client: { select: { name: true, cpfCnpj: true } },
  _count: { select: { invoices: true } },
} as const satisfies Prisma.ContractSelect;

type Row = Prisma.ContractGetPayload<{ select: typeof SELECT }>;

const BASE_COLUMNS = [
  { key: 'number', label: 'Contrato', kind: 'text' as const, width: 12 },
  { key: 'clientName', label: 'Cliente', kind: 'text' as const, width: 24 },
  { key: 'serviceType', label: 'Serviço', kind: 'text' as const, width: 18 },
  { key: 'monthlyValue', label: 'Valor mensal', kind: 'money' as const, width: 12 },
  { key: 'dueDay', label: 'Vence dia', kind: 'integer' as const, width: 8 },
  { key: 'startDate', label: 'Início', kind: 'date' as const, width: 10 },
  { key: 'endDate', label: 'Término', kind: 'date' as const, width: 10 },
  { key: 'invoices', label: 'Faturas', kind: 'integer' as const, width: 8 },
  { key: 'status', label: 'Situação', kind: 'text' as const, width: 11 },
];

/** O relatório de "vencendo" troca a contagem de faturas por dias restantes. */
const EXPIRING_COLUMNS = [
  ...BASE_COLUMNS.slice(0, 7),
  { key: 'daysLeft', label: 'Dias p/ vencer', kind: 'integer' as const, width: 11 },
  { key: 'status', label: 'Situação', kind: 'text' as const, width: 11 },
];

function toRow(contract: Row, reference: string) {
  const endDate = contract.endDate ? utcToIsoDate(contract.endDate) : null;

  return {
    number: contract.number,
    clientName: contract.client.name,
    serviceType: contract.serviceType,
    monthlyValue: contract.monthlyValue.toFixed(2),
    dueDay: contract.dueDay,
    startDate: utcToIsoDate(contract.startDate),
    endDate,
    invoices: contract._count.invoices,
    daysLeft: endDate ? daysBetween(reference, endDate) : null,
    status: CONTRACT_STATUS_LABELS[contract.status],
  };
}

interface RunOptions {
  /** Situações incluídas. Vazio = todas. */
  statuses?: ContractStatus[];
  /** Apenas contratos terminando na janela de vencimento. */
  expiringOnly?: boolean;
}

async function runContracts(
  options: RunOptions,
  filters: ReportFilters,
  page: number,
  pageSize: number,
): Promise<ReportResult> {
  const reference = today();
  const where: Prisma.ContractWhereInput = {};

  if (filters.clientId) where.clientId = filters.clientId;

  if (options.statuses && options.statuses.length > 0) {
    where.status = { in: options.statuses };
  }

  // A situação escolhida no filtro estreita o recorte do relatório, nunca o
  // amplia: um relatório de encerrados filtrado por "cancelado" devolve vazio,
  // e não a lista de cancelados.
  if (filters.status && (CONTRACT_STATUS_LABELS as Record<string, string>)[filters.status]) {
    const chosen = filters.status as ContractStatus;
    const allowed = options.statuses;

    where.status = allowed && !allowed.includes(chosen) ? { in: [] } : chosen;
  }

  if (options.expiringOnly) {
    /**
     * Janela de vencimento: término entre hoje e hoje + 30 dias.
     *
     * Contrato sem término (`endDate` nulo) fica FORA: vigência indeterminada
     * não vence, e incluí-lo obrigaria o usuário a ignorar linhas manualmente.
     */
    where.endDate = {
      gte: new Date(`${reference}T00:00:00.000Z`),
      lte: new Date(`${addDays(reference, CONTRACT_EXPIRY_WINDOW_DAYS)}T00:00:00.000Z`),
    };
  } else {
    const range = dateRange(filters.from, filters.to);
    if (range) where.startDate = range;
  }

  const [total, items, aggregate] = await prisma.$transaction([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      select: SELECT,
      // Vencendo primeiro o mais urgente; os demais, o mais recente primeiro.
      orderBy: options.expiringOnly ? { endDate: 'asc' } : { startDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    // Soma feita no PostgreSQL, em `numeric` — nunca em ponto flutuante do JS.
    prisma.contract.aggregate({ where, _sum: { monthlyValue: true } }),
  ]);

  const monthly = decimalToString(aggregate._sum.monthlyValue);

  return {
    rows: items.map((contract) => toRow(contract, reference)),
    summary: [
      countSummary('Contratos', total),
      moneySummary('Soma dos valores mensais', monthly, 'Receita recorrente do recorte'),
    ],
    total,
  };
}

const ALL_STATUSES = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'RENEWAL', label: 'Em renovação' },
  { value: 'CLOSED', label: 'Encerrado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

export const contractReports: ReportDefinition[] = [
  {
    id: 'contracts-active',
    title: 'Contratos ativos',
    description:
      'Contratos em vigor, incluindo os pendentes de início e os em renovação. ' +
      'A soma dos valores mensais é a receita recorrente do escritório.',
    group: 'contracts',
    restricted: false,
    periodField: 'Data de início',
    filters: {
      period: true,
      client: true,
      statuses: ALL_STATUSES.filter((item) =>
        ['ACTIVE', 'PENDING', 'RENEWAL'].includes(item.value),
      ),
    },
    columns: BASE_COLUMNS,
    run: (filters, page, pageSize) =>
      runContracts(
        { statuses: [ContractStatus.ACTIVE, ContractStatus.PENDING, ContractStatus.RENEWAL] },
        filters,
        page,
        pageSize,
      ),
  },
  {
    id: 'contracts-closed',
    title: 'Contratos encerrados',
    description:
      'Contratos que chegaram ao fim da vigência e cumpriram o acordado. Não inclui ' +
      'cancelados — encerrar e cancelar são coisas diferentes.',
    group: 'contracts',
    restricted: false,
    periodField: 'Data de início',
    filters: { period: true, client: true, statuses: [] },
    columns: BASE_COLUMNS,
    run: (filters, page, pageSize) =>
      runContracts({ statuses: [ContractStatus.CLOSED] }, filters, page, pageSize),
  },
  {
    id: 'contracts-cancelled',
    title: 'Contratos cancelados',
    description:
      'Contratos desfeitos antes do fim previsto. As faturas já emitidas continuam ' +
      'existindo — cancelar o contrato não cancela cobrança.',
    group: 'contracts',
    restricted: false,
    periodField: 'Data de início',
    filters: { period: true, client: true, statuses: [] },
    columns: BASE_COLUMNS,
    run: (filters, page, pageSize) =>
      runContracts({ statuses: [ContractStatus.CANCELLED] }, filters, page, pageSize),
  },
  {
    id: 'contracts-expiring',
    title: 'Contratos vencendo',
    description:
      `Contratos em vigor cujo término cai nos próximos ${CONTRACT_EXPIRY_WINDOW_DAYS} dias, ` +
      'do mais urgente ao menos. Contratos de vigência indeterminada ficam de fora. ' +
      'O filtro de datas não se aplica: a janela é sempre contada a partir de hoje.',
    group: 'contracts',
    restricted: false,
    periodField: 'Janela de vencimento',
    // `period: false` porque a janela é fixa a partir de hoje. Oferecer o campo
    // de datas seria oferecer um controle que a consulta ignora.
    filters: { period: false, client: true, statuses: [] },
    columns: EXPIRING_COLUMNS,
    run: (filters, page, pageSize) =>
      runContracts(
        {
          statuses: [ContractStatus.ACTIVE, ContractStatus.PENDING, ContractStatus.RENEWAL],
          expiringOnly: true,
        },
        filters,
        page,
        pageSize,
      ),
  },
];

import { ClientStatus, type Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { utcToIsoDate } from '../../utils/date.js';
import { countSummary, dateRange } from '../helpers.js';
import type { ReportDefinition, ReportFilters, ReportResult } from '../types.js';

/**
 * Relatórios de clientes.
 *
 * Os três compartilham as mesmas colunas e a mesma consulta; o que muda é o
 * recorte de situação e o campo de data. Por isso existe uma fábrica em vez de
 * três funções parecidas — a diferença fica explícita nos argumentos, e uma
 * correção de coluna vale para os três de uma vez.
 */

const COLUMNS = [
  { key: 'name', label: 'Cliente', kind: 'text' as const, width: 26 },
  { key: 'companyName', label: 'Nome fantasia', kind: 'text' as const, width: 20 },
  { key: 'document', label: 'CPF / CNPJ', kind: 'text' as const, width: 14 },
  { key: 'email', label: 'E-mail', kind: 'text' as const, width: 20 },
  { key: 'phone', label: 'Telefone', kind: 'text' as const, width: 12 },
  { key: 'city', label: 'Cidade', kind: 'text' as const, width: 14 },
  { key: 'state', label: 'UF', kind: 'text' as const, width: 5 },
  { key: 'contracts', label: 'Contratos', kind: 'integer' as const, width: 9 },
  { key: 'createdAt', label: 'Cadastro', kind: 'date' as const, width: 10 },
];

const SELECT = {
  id: true,
  name: true,
  companyName: true,
  cpfCnpj: true,
  email: true,
  phone: true,
  city: true,
  state: true,
  status: true,
  createdAt: true,
  _count: { select: { contracts: true } },
} as const satisfies Prisma.ClientSelect;

type Row = Prisma.ClientGetPayload<{ select: typeof SELECT }>;

/**
 * Máscara de CPF/CNPJ.
 *
 * O banco guarda só dígitos — decisão do módulo de clientes, para não quebrar
 * busca e unicidade. Quem recebe a planilha, porém, espera o documento
 * formatado: `11222333000181` não é conferível a olho.
 */
function maskDocument(digits: string): string {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }

  return digits;
}

function maskPhone(digits: string | null): string | null {
  if (!digits) return null;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function toRow(client: Row) {
  return {
    name: client.name,
    companyName: client.companyName,
    document: maskDocument(client.cpfCnpj),
    email: client.email,
    phone: maskPhone(client.phone),
    city: client.city,
    state: client.state,
    contracts: client._count.contracts,
    createdAt: utcToIsoDate(client.createdAt),
  };
}

async function runClients(
  status: ClientStatus | undefined,
  filters: ReportFilters,
  page: number,
  pageSize: number,
): Promise<ReportResult> {
  const where: Prisma.ClientWhereInput = {};

  if (status) where.status = status;
  if (filters.clientId) where.id = filters.clientId;

  const created = dateRange(filters.from, filters.to);
  if (created) where.createdAt = created;

  const [total, items, ativos, inativos] = await prisma.$transaction([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      select: SELECT,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where: { ...where, status: ClientStatus.ACTIVE } }),
    prisma.client.count({ where: { ...where, status: ClientStatus.INACTIVE } }),
  ]);

  // Contagens sempre sobre o filtro inteiro, nunca sobre a página. Um resumo
  // que mudasse ao virar a página não seria um resumo.
  const summary = status
    ? [countSummary('Clientes no relatório', total)]
    : [
        countSummary('Clientes no relatório', total),
        countSummary('Ativos', ativos),
        countSummary('Inativos', inativos),
      ];

  return { rows: items.map(toRow), summary, total };
}

const FILTERS_WITH_STATUS = {
  period: true,
  client: true,
  statuses: [
    { value: 'ACTIVE', label: 'Ativos' },
    { value: 'INACTIVE', label: 'Inativos' },
  ],
};

const FILTERS_FIXED_STATUS = { period: true, client: true, statuses: [] };

export const clientReports: ReportDefinition[] = [
  {
    id: 'clients-active',
    title: 'Clientes ativos',
    description:
      'Clientes em operação hoje, com contato, cidade e quantos contratos cada um tem. ' +
      'O período recorta pela data de cadastro.',
    group: 'clients',
    restricted: false,
    periodField: 'Data de cadastro',
    filters: FILTERS_FIXED_STATUS,
    columns: COLUMNS,
    run: (filters, page, pageSize) => runClients(ClientStatus.ACTIVE, filters, page, pageSize),
  },
  {
    id: 'clients-inactive',
    title: 'Clientes inativos',
    description:
      'Clientes fora de operação. Continuam no sistema com todo o histórico — inativar ' +
      'não apaga contratos nem faturas.',
    group: 'clients',
    restricted: false,
    periodField: 'Data de cadastro',
    filters: FILTERS_FIXED_STATUS,
    columns: COLUMNS,
    run: (filters, page, pageSize) => runClients(ClientStatus.INACTIVE, filters, page, pageSize),
  },
  {
    id: 'clients-new',
    title: 'Novos clientes por período',
    description:
      'Clientes cadastrados no intervalo escolhido, ativos e inativos. Sem datas, ' +
      'traz a base inteira.',
    group: 'clients',
    restricted: false,
    periodField: 'Data de cadastro',
    filters: FILTERS_WITH_STATUS,
    columns: COLUMNS,
    run: (filters, page, pageSize) =>
      runClients(
        filters.status === 'ACTIVE' || filters.status === 'INACTIVE'
          ? (filters.status as ClientStatus)
          : undefined,
        filters,
        page,
        pageSize,
      ),
  },
];

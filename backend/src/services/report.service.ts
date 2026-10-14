import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { toCsvFile } from '../reports/formatters/csv.js';
import { toPdfFile } from '../reports/formatters/pdf.js';
import { toXlsxFile } from '../reports/formatters/xlsx.js';
import { REPORT_EXPORT_MAX_ROWS, describeFilters } from '../reports/helpers.js';
import { findReport, listReports } from '../reports/registry.js';
import {
  toCatalogItem,
  type ReportCatalogItem,
  type ReportDefinition,
  type ReportFile,
  type ReportFilters,
  type ReportFormat,
} from '../reports/types.js';

/**
 * Serviço de relatórios — a única porta entre a API e o catálogo.
 *
 * Toda a lógica de "que relatório é este" mora nas definições; aqui ficam as
 * três coisas comuns a todos: autorização, montagem do documento e escolha do
 * formatador.
 */

/**
 * Autorização.
 *
 * Um relatório `restricted` exige ADMIN, e a checagem é feita AQUI, no serviço,
 * não na rota. A rota é uma só para os quinze relatórios, então ela não tem como
 * saber se o `:id` que chegou é restrito — só o catálogo sabe. Amarrar a
 * permissão à definição também significa que um relatório novo declara a própria
 * exigência e não depende de alguém lembrar de atualizar uma lista em outro
 * arquivo.
 */
function authorize(report: ReportDefinition, actor: AuthenticatedUser): void {
  if (report.restricted && actor.role !== 'ADMIN') {
    throw AppError.forbidden(
      'Os relatórios financeiros são restritos a administradores. ' +
        'Os relatórios de clientes, contratos e faturas continuam disponíveis.',
    );
  }
}

function requireReport(id: string, actor: AuthenticatedUser): ReportDefinition {
  const report = findReport(id);

  /**
   * 404 para relatório inexistente E para restrito sem permissão? Não.
   *
   * Aqui o 403 é o correto, diferente das notificações. Lá o id é de OUTRA
   * pessoa e um 403 confirmaria que aquele registro existe. O catálogo de
   * relatórios é fixo e público na documentação — esconder que "finance-overdue"
   * existe não protege nada, e uma mensagem clara evita que o funcionário
   * conclua que o sistema está com defeito.
   */
  if (!report) {
    throw AppError.notFound('Relatório não encontrado.');
  }

  authorize(report, actor);

  return report;
}

export function getCatalog(actor: AuthenticatedUser): ReportCatalogItem[] {
  return listReports(actor.role === 'ADMIN').map(toCatalogItem);
}

/** Nome do cliente para o cabeçalho, quando há filtro por cliente. */
async function resolveClientName(clientId?: string): Promise<string | null> {
  if (!clientId) return null;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true },
  });

  // Cliente inexistente não derruba o relatório: ele simplesmente não terá
  // linhas, e o cabeçalho diz "todos os clientes" em vez de mentir um nome.
  return client?.name ?? null;
}

function statusLabel(report: ReportDefinition, status?: string): string | null {
  if (!status) return null;

  return report.filters.statuses.find((item) => item.value === status)?.label ?? status;
}

export interface RunReportResult {
  report: ReportCatalogItem;
  subtitle: string;
  rows: ReturnType<typeof Object>[];
  summary: Awaited<ReturnType<ReportDefinition['run']>>['summary'];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function runReport(
  id: string,
  filters: ReportFilters,
  page: number,
  pageSize: number,
  actor: AuthenticatedUser,
) {
  const report = requireReport(id, actor);

  const [result, clientName] = await Promise.all([
    report.run(filters, page, pageSize),
    resolveClientName(filters.clientId),
  ]);

  return {
    report: toCatalogItem(report),
    subtitle: describeFilters(
      filters,
      report.periodField,
      clientName,
      statusLabel(report, filters.status),
    ),
    rows: result.rows,
    summary: result.summary,
    page,
    pageSize,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
  };
}

/** Data e hora da emissão, no fuso do escritório. */
function generatedAtLabel(): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return formatter.format(new Date()).replace(',', ' às');
}

/** Nome de arquivo sem acento, espaço ou caractere que o Windows recuse. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const WRITERS: Record<ReportFormat, typeof toCsvFile> = {
  csv: toCsvFile,
  xlsx: toXlsxFile,
  pdf: toPdfFile,
};

export async function exportReport(
  id: string,
  format: ReportFormat,
  filters: ReportFilters,
  actor: AuthenticatedUser,
): Promise<ReportFile> {
  const report = requireReport(id, actor);

  // Página 1 com o teto como tamanho: a exportação leva o recorte inteiro, não
  // a página que está na tela. Quem exporta quer o arquivo completo.
  const [result, clientName] = await Promise.all([
    report.run(filters, 1, REPORT_EXPORT_MAX_ROWS),
    resolveClientName(filters.clientId),
  ]);

  if (result.total > REPORT_EXPORT_MAX_ROWS) {
    throw AppError.validation(
      `O recorte selecionado tem ${result.total} registros, acima do limite de ` +
        `${REPORT_EXPORT_MAX_ROWS} por exportação. Estreite o período ou filtre por cliente.`,
    );
  }

  const document = {
    title: report.title,
    subtitle: describeFilters(
      filters,
      report.periodField,
      clientName,
      statusLabel(report, filters.status),
    ),
    columns: report.columns,
    rows: result.rows,
    summary: result.summary,
    generatedAt: generatedAtLabel(),
  };

  // A data no nome do arquivo evita que três exportações do mesmo relatório
  // virem "relatorio (1)", "relatorio (2)" na pasta de downloads.
  const baseName = `${slugify(report.title)}-${new Date().toISOString().slice(0, 10)}`;

  return WRITERS[format](document, baseName);
}

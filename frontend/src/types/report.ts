export type ReportGroup = 'clients' | 'contracts' | 'finance' | 'invoices';

export const REPORT_GROUP_LABELS: Record<ReportGroup, string> = {
  clients: 'Clientes',
  contracts: 'Contratos',
  invoices: 'Faturas',
  finance: 'Financeiro',
};

/** Ordem de exibição dos grupos — segue o fluxo do sistema, não o alfabeto. */
export const REPORT_GROUP_ORDER: ReportGroup[] = ['clients', 'contracts', 'invoices', 'finance'];

export type ReportColumnKind = 'text' | 'number' | 'money' | 'date' | 'integer';

export interface ReportColumn {
  key: string;
  label: string;
  kind: ReportColumnKind;
  width?: number;
}

export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

export interface ReportSummaryItem {
  label: string;
  value: string;
  kind: ReportColumnKind;
  hint?: string;
}

export interface ReportFilterSupport {
  period: boolean;
  client: boolean;
  statuses: { value: string; label: string }[];
}

/**
 * Relatório como o catálogo o descreve.
 *
 * A interface NÃO conhece nenhum relatório em particular: ela desenha os
 * filtros que `filters` declara e a tabela que `columns` descreve. Por isso um
 * relatório novo aparece na tela sem uma linha de frontend — foi o que o
 * catálogo do backend existe para permitir.
 */
export interface ReportCatalogItem {
  id: string;
  title: string;
  description: string;
  group: ReportGroup;
  /** Somente administradores. O catálogo do funcionário já vem sem eles. */
  restricted: boolean;
  /** Sobre qual data o período incide, em linguagem de usuário. */
  periodField: string;
  filters: ReportFilterSupport;
  columns: ReportColumn[];
}

export interface ReportFilters {
  from?: string;
  to?: string;
  clientId?: string;
  status?: string;
}

export interface ReportResult {
  report: ReportCatalogItem;
  /** Linha de contexto: período, cliente e situação aplicados. */
  subtitle: string;
  rows: ReportRow[];
  summary: ReportSummaryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel',
  pdf: 'PDF',
};

export const REPORT_FORMAT_HINTS: Record<ReportFormat, string> = {
  csv: 'Texto separado por ponto e vírgula. Abre em qualquer planilha.',
  xlsx: 'Planilha do Excel, com os valores já como número para somar.',
  pdf: 'Documento pronto para imprimir ou enviar por e-mail.',
};

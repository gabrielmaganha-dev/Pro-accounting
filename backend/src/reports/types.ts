/**
 * NÚCLEO REUTILIZÁVEL DE RELATÓRIOS.
 *
 * O objetivo deste módulo é que acrescentar um relatório novo custe UM objeto
 * de definição — nada de rota, controller, validador ou exportador novos. Sem
 * isso, quinze relatórios viram quinze rotas quase idênticas, e o décimo sexto
 * começa por copiar e colar o décimo quinto.
 *
 * A divisão de responsabilidades:
 *
 *   definição  → o que este relatório é: título, colunas, filtros que aceita,
 *                quem pode ver e como buscar as linhas;
 *   registro   → o catálogo de definições;
 *   formatador → transforma linhas em CSV, XLSX ou PDF, sem saber de qual
 *                relatório vieram;
 *   rota       → uma só, para todos.
 *
 * Um formatador nunca conhece um relatório específico, e uma definição nunca
 * conhece um formato. É o que permite que o PDF tenha nascido depois dos
 * relatórios sem tocar em nenhum deles.
 */

/** Como a coluna deve ser alinhada e formatada na planilha e no PDF. */
export type ReportColumnKind = 'text' | 'number' | 'money' | 'date' | 'integer';

export interface ReportColumn {
  /** Chave correspondente no objeto de linha. */
  key: string;
  /** Cabeçalho exibido na tela e no arquivo exportado. */
  label: string;
  kind: ReportColumnKind;
  /** Largura relativa, usada pelo PDF para distribuir o espaço da página. */
  width?: number;
}

/**
 * Valor de célula já resolvido pelo serviço.
 *
 * `null` representa ausência e vira travessão na tela e célula vazia no
 * arquivo — diferente de zero, que é um valor.
 *
 * Dinheiro trafega como STRING, nunca como number: um valor em `Decimal(12,2)`
 * convertido para o ponto flutuante do JavaScript perde centavos em somas
 * grandes, e este é um sistema contábil.
 */
export type ReportCell = string | number | null;

export type ReportRow = Record<string, ReportCell>;

/** Um número destacado no topo do relatório. */
export interface ReportSummaryItem {
  label: string;
  value: string;
  kind: ReportColumnKind;
  /** Texto curto explicando de onde o número sai. */
  hint?: string;
}

export const REPORT_GROUPS = ['clients', 'contracts', 'finance', 'invoices'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export const REPORT_GROUP_LABELS: Record<ReportGroup, string> = {
  clients: 'Clientes',
  contracts: 'Contratos',
  finance: 'Financeiro',
  invoices: 'Faturas',
};

/** Filtros que um relatório aceita. Declarados para a interface saber o que exibir. */
export interface ReportFilterSupport {
  /** Aceita recorte por data inicial e final. */
  period: boolean;
  /** Aceita filtro por cliente. */
  client: boolean;
  /**
   * Situações disponíveis no filtro, já traduzidas. Vazio = o relatório tem
   * situação fixa (um relatório de "clientes inativos" não oferece o filtro).
   */
  statuses: { value: string; label: string }[];
}

export interface ReportFilters {
  from?: string;
  to?: string;
  clientId?: string;
  status?: string;
}

export interface ReportResult {
  rows: ReportRow[];
  summary: ReportSummaryItem[];
  /** Total de linhas antes da paginação. */
  total: number;
}

/**
 * Definição de um relatório.
 *
 * `restricted` marca os relatórios de gestão. Ele é lido pela rota, que recusa
 * o acesso antes de qualquer consulta — e também pelo catálogo, que omite o
 * relatório para quem não pode vê-lo. As duas coisas são necessárias e
 * diferentes: omitir do catálogo evita oferecer um botão que dará erro;
 * recusar na rota é o que de fato protege o dado.
 */
export interface ReportDefinition {
  id: string;
  title: string;
  /** Uma frase dizendo o que entra e o que não entra no relatório. */
  description: string;
  group: ReportGroup;
  /** Somente ADMIN. */
  restricted: boolean;

  /**
   * Campo de data sobre o qual o período incide, em linguagem de usuário.
   *
   * Aparece na interface e no cabeçalho do arquivo exportado. Sem isso, um
   * relatório filtrado "de 01/09 a 30/09" é ambíguo — emitidas em setembro?
   * vencendo em setembro? pagas em setembro? — e o número não pode ser
   * conferido por ninguém.
   */
  periodField: string;

  filters: ReportFilterSupport;
  columns: ReportColumn[];

  /** Busca as linhas. Paginação e cálculo acontecem aqui, no banco. */
  run(filters: ReportFilters, page: number, pageSize: number): Promise<ReportResult>;
}

/** O relatório como o catálogo o entrega à interface — sem a função `run`. */
export type ReportCatalogItem = Omit<ReportDefinition, 'run'>;

export function toCatalogItem(definition: ReportDefinition): ReportCatalogItem {
  const { run: _run, ...item } = definition;
  return item;
}

export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** Arquivo pronto para o `Content-Disposition`. */
export interface ReportFile {
  filename: string;
  contentType: string;
  body: string | Buffer;
}

/** Tudo o que um formatador precisa para montar o arquivo. */
export interface ReportDocument {
  title: string;
  /** Linha de contexto: período, cliente e situação aplicados. */
  subtitle: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryItem[];
  /** Data e hora da emissão, já formatadas em pt-BR. */
  generatedAt: string;
}

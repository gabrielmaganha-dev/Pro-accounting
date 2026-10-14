import { clientReports } from './definitions/clients.js';
import { contractReports } from './definitions/contracts.js';
import { financeReports } from './definitions/finance.js';
import { invoiceReports } from './definitions/invoices.js';
import type { ReportDefinition } from './types.js';

/**
 * Catálogo de relatórios.
 *
 * Acrescentar um relatório é escrever a definição no arquivo do grupo e
 * incluí-la no array do grupo. Nada mais: nem rota, nem controller, nem
 * validador, nem exportador. Foi para isso que o núcleo existe.
 *
 * A ordem daqui é a ordem em que a interface exibe os grupos, e ela segue o
 * fluxo do sistema — cliente, contrato, fatura, dinheiro — em vez da ordem
 * alfabética, porque é assim que quem usa o sistema pensa.
 */
const ALL: ReportDefinition[] = [
  ...clientReports,
  ...contractReports,
  ...invoiceReports,
  ...financeReports,
];

/** Índice por id, montado uma vez. */
const BY_ID = new Map(ALL.map((report) => [report.id, report]));

/**
 * Checagem de integridade na carga do módulo.
 *
 * Dois relatórios com o mesmo id fariam um deles ficar inalcançável — o mapa
 * guarda o último. Falhar aqui derruba o servidor na subida, com a mensagem
 * certa, em vez de produzir um relatório que abre a tela do outro.
 */
if (BY_ID.size !== ALL.length) {
  const vistos = new Set<string>();
  const repetidos = ALL.map((r) => r.id).filter((id) => !vistos.add(id));

  throw new Error(`Relatórios com id repetido no catálogo: ${repetidos.join(', ')}`);
}

export function listReports(includeRestricted: boolean): ReportDefinition[] {
  return includeRestricted ? ALL : ALL.filter((report) => !report.restricted);
}

export function findReport(id: string): ReportDefinition | undefined {
  return BY_ID.get(id);
}

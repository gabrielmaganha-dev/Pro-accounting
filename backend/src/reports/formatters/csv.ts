import { formatCellText } from '../format.js';
import type { ReportDocument, ReportFile } from '../types.js';

/**
 * Exportação em CSV.
 *
 * Duas decisões fazem o arquivo abrir certo no Excel brasileiro, e as duas já
 * valiam na exportação do módulo financeiro — este módulo passou a ser a única
 * implementação das duas, para que não existam dois CSVs do mesmo sistema com
 * regras diferentes:
 *
 *  • **Ponto e vírgula** como separador. O Excel em português usa a vírgula
 *    como decimal, então um CSV separado por vírgula quebra toda linha que
 *    tenha dinheiro.
 *  • **BOM UTF-8** no início. Sem ele, o Excel abre o arquivo em ANSI e
 *    "João" vira "JoÃ£o".
 */
export function toCsvFile(document: ReportDocument, baseName: string): ReportFile {
  const rows: string[][] = [];

  // Cabeçalho de contexto: sem ele, um arquivo achado meses depois na pasta de
  // downloads não diz de que período é nem que filtros tinha.
  rows.push([document.title]);
  rows.push([document.subtitle]);
  rows.push([`Emitido em ${document.generatedAt}`]);
  rows.push([]);

  if (document.summary.length > 0) {
    for (const item of document.summary) {
      rows.push([item.label, item.value]);
    }
    rows.push([]);
  }

  rows.push(document.columns.map((column) => column.label));

  for (const row of document.rows) {
    rows.push(
      document.columns.map((column) => formatCellText(row[column.key] ?? null, column.kind)),
    );
  }

  return {
    filename: `${baseName}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: serialize(rows),
  };
}

function serialize(rows: string[][]): string {
  const escape = (cell: string): string => {
    // Aspas duplas, ponto e vírgula ou quebra de linha exigem o campo entre
    // aspas, com as aspas internas duplicadas.
    if (/["\n;]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };

  const content = rows.map((row) => row.map(escape).join(';')).join('\r\n');

  return `\uFEFF${content}`;
}

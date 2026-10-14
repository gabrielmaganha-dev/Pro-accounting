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
  const escape = (rawCell: string): string => {
    // Injeção de fórmula: o Excel executa como fórmula qualquer célula que
    // comece com = + - @ (ou tab/CR). Nome de cliente e número de fatura são
    // digitados por usuários, então um cliente cadastrado como
    // `=HYPERLINK(...)` viraria um link malicioso na planilha de quem exporta.
    // O apóstrofo força o Excel a tratar a célula como texto. Número puro
    // (inclusive negativo, como um saldo "-150,00") fica como está: não há
    // fórmula ali, e o apóstrofo impediria a soma da coluna.
    const isPlainNumber = /^-?\d[\d.,]*$/.test(rawCell);
    const cell = !isPlainNumber && /^[=+\-@\t\r]/.test(rawCell) ? `'${rawCell}` : rawCell;

    // Aspas duplas, ponto e vírgula ou quebra de linha exigem o campo entre
    // aspas, com as aspas internas duplicadas.
    if (/["\r\n;]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };

  const content = rows.map((row) => row.map(escape).join(';')).join('\r\n');

  return `\uFEFF${content}`;
}

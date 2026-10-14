import { toSpreadsheetValue } from '../format.js';
import type { ReportColumnKind, ReportDocument, ReportFile } from '../types.js';
import { buildZip, escapeXml, type ZipEntry } from './zip.js';

/**
 * Exportação em Excel (.xlsx).
 *
 * O ganho sobre o CSV é um só, e é decisivo: as colunas de valor chegam como
 * NÚMERO. No CSV elas são texto — alinham à esquerda, não somam e obrigam o
 * usuário a refazer a formatação antes de trabalhar. Quem exporta um relatório
 * financeiro vai somar a coluna; entregar texto é entregar o trabalho pela
 * metade.
 *
 * O arquivo tem o mínimo de partes que o Excel aceita. `styles.xml` entra
 * porque sem ele as datas e os valores saem sem formato nenhum e o cabeçalho
 * fica indistinguível dos dados.
 */

/**
 * Índices dos formatos declarados em `styles.xml`, na ordem em que aparecem.
 * Trocar a ordem lá sem trocar aqui produz uma planilha com moeda no lugar da
 * data — e o Excel não reclama, só exibe errado.
 */
const STYLE_DEFAULT = 0;
const STYLE_TITLE = 1;
const STYLE_HEADER = 2;
const STYLE_MONEY = 3;
const STYLE_INTEGER = 4;

function styleFor(kind: ReportColumnKind): number {
  if (kind === 'money') return STYLE_MONEY;
  if (kind === 'integer') return STYLE_INTEGER;
  return STYLE_DEFAULT;
}

/** Converte índice de coluna em letra: 0 -> A, 26 -> AA. */
function columnLetter(index: number): string {
  let letter = '';
  let current = index;

  do {
    letter = String.fromCharCode(65 + (current % 26)) + letter;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return letter;
}

interface Cell {
  value: string;
  type: 'number' | 'text';
  style: number;
}

function cellXml(cell: Cell, column: number, row: number): string {
  const ref = `${columnLetter(column)}${row}`;

  if (cell.value === '') return '';

  if (cell.type === 'number') {
    return `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`;
  }

  // `t="inlineStr"` evita a tabela de strings compartilhadas, que exigiria uma
  // segunda parte no arquivo e um índice a manter em sincronia. O custo é
  // repetir texto igual; para relatórios de algumas milhares de linhas, é
  // irrelevante perto da complexidade que elimina.
  return `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

export function toXlsxFile(document: ReportDocument, baseName: string): ReportFile {
  const lines: string[] = [];
  let rowNumber = 0;

  const pushRow = (cells: Cell[]): void => {
    rowNumber += 1;
    const content = cells.map((cell, index) => cellXml(cell, index, rowNumber)).join('');
    lines.push(`<row r="${rowNumber}">${content}</row>`);
  };

  const text = (value: string, style = STYLE_DEFAULT): Cell => ({ value, type: 'text', style });

  // --- Cabeçalho de contexto ---
  pushRow([text(document.title, STYLE_TITLE)]);
  pushRow([text(document.subtitle)]);
  pushRow([text(`Emitido em ${document.generatedAt}`)]);
  pushRow([]);

  for (const item of document.summary) {
    pushRow([text(item.label), text(item.value)]);
  }

  if (document.summary.length > 0) pushRow([]);

  // --- Cabeçalho da tabela ---
  const headerRow = rowNumber + 1;
  pushRow(document.columns.map((column) => text(column.label, STYLE_HEADER)));

  // --- Dados ---
  for (const row of document.rows) {
    pushRow(
      document.columns.map((column) => {
        const resolved = toSpreadsheetValue(row[column.key] ?? null, column.kind);
        return { ...resolved, style: styleFor(column.kind) };
      }),
    );
  }

  const lastColumn = columnLetter(Math.max(document.columns.length - 1, 0));

  /**
   * `autoFilter` no cabeçalho e `freeze` abaixo dele.
   *
   * São dois cliques que todo mundo dá ao abrir um relatório exportado: travar
   * o cabeçalho para ele não sumir ao rolar, e ligar o filtro para procurar um
   * cliente. Entregar isso pronto é a diferença entre um arquivo que já serve e
   * um que precisa ser preparado antes de usar.
   */
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0" tabSelected="1">` +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    '</sheetView></sheetViews>' +
    '<cols>' +
    document.columns
      .map(
        (column, index) =>
          `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 18}" customWidth="1"/>`,
      )
      .join('') +
    '</cols>' +
    `<sheetData>${lines.join('')}</sheetData>` +
    `<autoFilter ref="A${headerRow}:${lastColumn}${rowNumber}"/>` +
    '</worksheet>';

  return {
    filename: `${baseName}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: buildZip(buildParts(sheet)),
  };
}

/**
 * As partes fixas do arquivo.
 *
 * Um .xlsx é um pacote OPC: cada parte é declarada em `[Content_Types].xml` e
 * ligada às outras por arquivos `.rels`. Faltando qualquer uma dessas
 * declarações, o Excel abre a caixa "o arquivo está corrompido" sem indicar o
 * que está faltando — por isso elas são montadas aqui, juntas, e não espalhadas.
 */
function buildParts(sheetXml: string): ZipEntry[] {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  /**
   * Formatos numéricos.
   *
   * O 164 é personalizado (os abaixo de 164 são reservados pelo padrão):
   * duas casas decimais com separador de milhar. A moeda NÃO leva "R$" no
   * formato — o símbolo viria fixo em português e, numa planilha aberta com
   * outra configuração regional, brigaria com o separador. O cabeçalho da
   * coluna já diz que é dinheiro.
   */
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    // A ORDEM destes <xf> define os índices STYLE_* no topo do arquivo.
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '</styleSheet>';

  return [
    { path: '[Content_Types].xml', content: contentTypes },
    { path: '_rels/.rels', content: rootRels },
    { path: 'xl/workbook.xml', content: workbook },
    { path: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { path: 'xl/styles.xml', content: styles },
    { path: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ];
}

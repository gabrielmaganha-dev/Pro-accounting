import { alignmentFor, formatCellText } from '../format.js';
import type { ReportColumn, ReportDocument, ReportFile } from '../types.js';

/**
 * Exportação em PDF.
 *
 * Um PDF é uma lista de objetos numerados e uma tabela (`xref`) que diz em que
 * byte cada um começa. As fontes "padrão 14" — Helvetica entre elas — não
 * precisam ser embutidas: todo leitor de PDF as tem. Isso é o que torna
 * viável gerar o arquivo aqui, sem dependência e sem carregar uma fonte de
 * centenas de kilobytes em cada resposta.
 *
 * O que este gerador faz: tabela paginada, com cabeçalho repetido em toda
 * página, título, filtros aplicados, totais e numeração "página X de Y".
 * O que ele NÃO faz: imagem, gráfico, fonte personalizada, texto fluido. Se
 * um relatório precisar disso, o caminho é trocar este arquivo por `pdfkit` —
 * nada fora dele conhece a estrutura de um PDF.
 *
 * O acento é a parte que mais dá errado num PDF gerado à mão. Helvetica usa
 * `WinAnsiEncoding` (equivalente ao CP1252), que cobre o português inteiro —
 * ver `toWinAnsi`, abaixo, e o motivo de não bastar `latin1`.
 */

// Medidas em pontos (1/72"). A4 retrato = 595 x 842.
const PAGE_WIDTH = 842; // paisagem: relatório é tabela larga
const PAGE_HEIGHT = 595;
const MARGIN = 32;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 15;
const TEXT_SIZE = 8;
const HEADER_SIZE = 8;
const LINE_HEIGHT = 13;

/**
 * Larguras médias dos glifos de Helvetica, em milésimos do corpo.
 *
 * Só o suficiente para decidir onde cortar um texto longo com reticências.
 * Sem uma medida ao menos aproximada, uma razão social comprida invade a
 * coluna vizinha e o PDF fica ilegível justamente nas linhas que interessam.
 */
function textWidth(text: string, size: number): number {
  let width = 0;

  for (const char of text) {
    if (/[iljtf.,:;'|![\]()]/.test(char)) width += 280;
    else if (/[A-Z@%]/.test(char)) width += 700;
    else if (/[mwMW]/.test(char)) width += 880;
    else if (char === ' ') width += 278;
    else width += 545;
  }

  return (width / 1000) * size;
}

function truncate(text: string, maxWidth: number, size: number): string {
  if (textWidth(text, size) <= maxWidth) return text;

  let result = text;

  while (result.length > 1 && textWidth(result + '…', size) > maxWidth) {
    result = result.slice(0, -1);
  }

  return result + '…';
}

/**
 * Escapa os três caracteres com significado dentro de uma string PDF.
 *
 * A barra invertida vem de `fromCharCode`, e não de um literal, de propósito:
 * escrever quatro barras para representar uma é a linha mais fácil de errar
 * deste arquivo, e o erro só apareceria quando alguém digitasse uma barra no
 * campo de observação de um cliente — meses depois, num PDF que não abre.
 */
/**
 * Caracteres do WinAnsi (CP1252) que NÃO coincidem com o latin1.
 *
 * Esta tabela é a diferença entre um PDF certo e um quase certo. As duas
 * codificações são idênticas exceto na faixa 0x80–0x9F, onde o CP1252 coloca
 * travessão, aspas curvas, reticências e o símbolo do euro. Codificar o texto
 * como latin1 — que é o atalho óbvio, já que os acentos do português coincidem
 * — faz o travessão "—" (U+2014) virar o byte 0x14, um caractere de controle,
 * e o leitor imprime lixo.
 *
 * Isso apareceria exatamente nos dois lugares em que mais incomoda: numa razão
 * social digitada com travessão e nas reticências que este próprio módulo
 * acrescenta ao cortar um texto largo demais para a coluna.
 */
const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * Converte texto para os bytes do WinAnsiEncoding declarado nas fontes.
 *
 * O que não existe no CP1252 — um emoji, um ideograma — vira "?" em vez de
 * quebrar o arquivo. Um caractere errado numa célula é um problema pequeno;
 * um PDF que não abre é um problema grande.
 */
function toWinAnsi(text: string): Buffer {
  const bytes: number[] = [];

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f;

    if (code <= 0xff) bytes.push(code);
    else bytes.push(WIN_ANSI_EXTRA[code] ?? 0x3f);
  }

  return Buffer.from(bytes);
}

const BACKSLASH = String.fromCharCode(92);

function escapePdfText(text: string): string {
  return text
    .split(BACKSLASH)
    .join(BACKSLASH + BACKSLASH)
    .split('(')
    .join(BACKSLASH + '(')
    .split(')')
    .join(BACKSLASH + ')');
}

/** Acumula os comandos de desenho de uma página. */
class PageBuilder {
  private readonly parts: string[] = [];

  text(x: number, y: number, size: number, value: string, bold = false): void {
    if (value === '') return;

    this.parts.push(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(value)}) Tj ET`,
    );
  }

  /** Texto alinhado à direita, para as casas decimais se alinharem. */
  textRight(right: number, y: number, size: number, value: string, bold = false): void {
    this.text(right - textWidth(value, size), y, size, value, bold);
  }

  line(x1: number, y1: number, x2: number, y2: number, gray = 0.75): void {
    this.parts.push(
      `${gray} G 0.5 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }

  /** Faixa de fundo — usada no cabeçalho e para zebrar as linhas. */
  rect(x: number, y: number, width: number, height: number, gray: number): void {
    this.parts.push(
      `${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f 0 g`,
    );
  }

  build(): string {
    return this.parts.join('\n');
  }
}

/** Distribui a largura da página entre as colunas, respeitando os pesos. */
function resolveWidths(columns: ReportColumn[]): number[] {
  const weights = columns.map((column) => column.width ?? 18);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  return weights.map((weight) => (weight / totalWeight) * CONTENT_WIDTH);
}

export function toPdfFile(document: ReportDocument, baseName: string): ReportFile {
  const widths = resolveWidths(document.columns);
  const offsets: number[] = [];

  let cursor = MARGIN;
  for (const width of widths) {
    offsets.push(cursor);
    cursor += width;
  }

  const pages: PageBuilder[] = [];
  let page = new PageBuilder();
  let y = 0;

  /** Desenha o cabeçalho e devolve a posição vertical da primeira linha. */
  const startPage = (isFirst: boolean): number => {
    let top = PAGE_HEIGHT - MARGIN;

    if (isFirst) {
      page.text(MARGIN, top - TITLE_SIZE, TITLE_SIZE, document.title, true);
      top -= TITLE_SIZE + 8;

      page.text(MARGIN, top - TEXT_SIZE, TEXT_SIZE, document.subtitle);
      top -= TEXT_SIZE + 4;

      page.text(MARGIN, top - TEXT_SIZE, TEXT_SIZE, `Emitido em ${document.generatedAt}`);
      top -= TEXT_SIZE + 10;

      if (document.summary.length > 0) {
        const line = document.summary
          .map((item) => `${item.label}: ${item.value}`)
          .join('     ');

        page.text(MARGIN, top - TEXT_SIZE, TEXT_SIZE, truncate(line, CONTENT_WIDTH, TEXT_SIZE), true);
        top -= TEXT_SIZE + 10;
      }
    }

    // Faixa do cabeçalho da tabela.
    page.rect(MARGIN, top - LINE_HEIGHT + 3, CONTENT_WIDTH, LINE_HEIGHT, 0.91);

    document.columns.forEach((column, index) => {
      const x = offsets[index] as number;
      const width = widths[index] as number;
      const label = truncate(column.label, width - 6, HEADER_SIZE);

      if (alignmentFor(column.kind) === 'right') {
        page.textRight(x + width - 3, top - LINE_HEIGHT + 7, HEADER_SIZE, label, true);
      } else {
        page.text(x + 3, top - LINE_HEIGHT + 7, HEADER_SIZE, label, true);
      }
    });

    return top - LINE_HEIGHT - 2;
  };

  y = startPage(true);

  document.rows.forEach((row, rowIndex) => {
    if (y < MARGIN + LINE_HEIGHT * 2) {
      pages.push(page);
      page = new PageBuilder();
      // Cabeçalho da tabela repetido: sem ele, a partir da página 2 ninguém
      // sabe qual coluna é qual.
      y = startPage(false);
    }

    // Zebra: em tabela larga, o olho perde a linha ao atravessar a página.
    if (rowIndex % 2 === 1) {
      page.rect(MARGIN, y - 3, CONTENT_WIDTH, LINE_HEIGHT, 0.97);
    }

    document.columns.forEach((column, index) => {
      const x = offsets[index] as number;
      const width = widths[index] as number;
      const value = truncate(
        formatCellText(row[column.key] ?? null, column.kind),
        width - 6,
        TEXT_SIZE,
      );

      if (alignmentFor(column.kind) === 'right') {
        page.textRight(x + width - 3, y + 1, TEXT_SIZE, value);
      } else {
        page.text(x + 3, y + 1, TEXT_SIZE, value);
      }
    });

    y -= LINE_HEIGHT;
  });

  if (document.rows.length === 0) {
    page.text(MARGIN, y, TEXT_SIZE, 'Nenhum registro encontrado com os filtros aplicados.');
  }

  pages.push(page);

  // Rodapé só agora, quando o total de páginas é conhecido.
  pages.forEach((current, index) => {
    current.line(MARGIN, MARGIN + 14, PAGE_WIDTH - MARGIN, MARGIN + 14, 0.8);
    current.text(MARGIN, MARGIN + 3, 7, 'Pro Accounting');
    current.textRight(
      PAGE_WIDTH - MARGIN,
      MARGIN + 3,
      7,
      `Página ${index + 1} de ${pages.length}`,
    );
  });

  return {
    filename: `${baseName}.pdf`,
    contentType: 'application/pdf',
    body: assemble(pages.map((current) => current.build())),
  };
}

/**
 * Monta a estrutura do arquivo PDF a partir do conteúdo de cada página.
 *
 * A parte que exige cuidado é a tabela `xref`: ela registra o byte EXATO em
 * que cada objeto começa, e o leitor usa esses números para navegar. Um offset
 * errado por um byte abre o arquivo em branco ou não abre. Por isso os
 * deslocamentos são medidos sobre os buffers JÁ CODIFICADOS em WinAnsi, e não
 * sobre o comprimento das strings: "ç" é um caractere e um byte aqui, mas dois
 * bytes em UTF-8, e a conta erraria em silêncio no primeiro nome acentuado.
 */
function assemble(pageContents: string[]): Buffer {
  const objects: string[] = [];
  const pageCount = pageContents.length;

  const pageObjectId = (index: number): number => 5 + index * 2;
  const contentObjectId = (index: number): number => 6 + index * 2;

  const kids = Array.from({ length: pageCount }, (_, index) => `${pageObjectId(index)} 0 R`).join(' ');

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  pageContents.forEach((content, index) => {
    objects[pageObjectId(index)] =
      '<< /Type /Page /Parent 2 0 R ' +
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ' +
      `/Contents ${contentObjectId(index)} 0 R >>`;

    const length = toWinAnsi(content).length;
    objects[contentObjectId(index)] = `<< /Length ${length} >>\nstream\n${content}\nendstream`;
  });

  const chunks: Buffer[] = [];
  let offset = 0;

  const push = (text: string): void => {
    const buffer = toWinAnsi(text);
    chunks.push(buffer);
    offset += buffer.length;
  };

  // %PDF-1.4 e, na segunda linha, bytes acima de 127 marcando o arquivo como
  // binário — é o que impede um cliente de FTP ou e-mail de "consertar" as
  // quebras de linha e corromper o conteúdo.
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const xref: number[] = [];

  for (let id = 1; id < objects.length; id += 1) {
    const body = objects[id];
    if (body === undefined) continue;

    xref[id] = offset;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  }

  const xrefStart = offset;
  const total = objects.length;

  // Entrada 0 é sempre a cabeça da lista de objetos livres, com esta forma fixa.
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;

  for (let id = 1; id < total; id += 1) {
    const position = xref[id] ?? 0;
    // Dez dígitos com zeros à esquerda e a terminação de 20 bytes por linha
    // fazem parte do formato: o leitor calcula a posição da entrada
    // multiplicando o índice por 20.
    table += `${String(position).padStart(10, '0')} 00000 n \n`;
  }

  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

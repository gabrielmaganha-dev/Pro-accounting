import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

import { formatIsoDateBr, formatMoneyBr } from '../reports/format.js';
import { formatCpfCnpj } from '../utils/document.js';
import type { EffectiveInvoiceStatus } from '../utils/invoice-status.js';

/**
 * Fatura de serviços em PDF.
 *
 * O desenho reproduz a fatura-modelo do escritório: cabeçalho com logo, dados
 * da empresa e número; destinatário; serviço e total; observação; faixa de
 * vencimento, forma de pagamento e total; e o canhoto de recebimento.
 *
 * As medidas estão em PIXELS DO MODELO — a imagem de referência tem 666 px de
 * largura e 422 px de altura — e a função `px` as converte para pontos do A4.
 * Assim cada número aqui pode ser conferido contra o modelo com uma régua, e
 * ajustar a posição de um campo é mudar um número que se vê na imagem.
 *
 * Usa `pdf-lib` e não o gerador escrito à mão dos relatórios porque a fatura
 * precisa de imagem (o logo), que aquele gerador não desenha. As fontes são as
 * padrão do PDF (Helvetica), que todo leitor já tem: nada de fonte embutida, e
 * o arquivo fica com poucas dezenas de KB.
 *
 * Este módulo só DESENHA. Buscar a fatura e decidir qual logo usar fica em
 * `services/invoice-pdf.service.ts`; aqui nada toca no banco.
 */

export interface InvoiceLogo {
  format: 'png' | 'jpeg';
  bytes: Uint8Array;
}

export interface InvoicePdfInput {
  company: {
    name: string;
    /** Somente dígitos. */
    cnpj: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    /** `null` = sem imagem utilizável: o nome da empresa ocupa a caixa do logo. */
    logo: InvoiceLogo | null;
    /** Texto do campo "Forma de Pagamento", ex.: "PIX CNPJ 11222333000181". */
    paymentInstructions: string | null;
  };
  client: {
    name: string;
    /** Somente dígitos. */
    cpfCnpj: string;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    /** Somente dígitos. */
    zipCode: string | null;
  };
  invoice: {
    number: string;
    /** `YYYY-MM-DD`. */
    issueDate: string;
    dueDate: string;
    /** Linha do serviço cobrado. */
    service: string;
    /** Decimais serializados, ex.: `405.25`. */
    amount: string;
    paidAmount: string;
    outstanding: string;
    notes: string | null;
    /** Situação EFETIVA (com a regra de atraso já aplicada). */
    status: EffectiveInvoiceStatus;
    lastPaymentDate: string | null;
  };
}

// ---------------------------------------------------------------------------
// Página e escala
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4 retrato, em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN = 28.35; // 1 cm

/** Medidas do modelo, em pixels. */
const MODEL_WIDTH = 666;
const MODEL_HEIGHT = 422;

/** Pontos por pixel do modelo. */
const S = (PAGE_WIDTH - MARGIN * 2) / MODEL_WIDTH;

/** Converte um comprimento do modelo (px) em pontos. */
const px = (value: number): number => value * S;

/** Coordenada X da página para uma posição horizontal do modelo. */
const xAt = (modelX: number): number => MARGIN + px(modelX);

/** Coordenada Y da página (PDF cresce para cima) para uma posição vertical do modelo. */
const yAt = (modelY: number): number => PAGE_HEIGHT - MARGIN - px(modelY);

// Cores tiradas do modelo.
const BLACK = rgb(0, 0, 0);
/** Azul-marinho dos dados preenchidos (#002060). */
const NAVY = rgb(0, 32 / 255, 96 / 255);
const LINE = rgb(0.25, 0.25, 0.25);
/** Fundo do formulário (#F2F2F2). */
const PAPER = rgb(242 / 255, 242 / 255, 242 / 255);
/** Faixa dos títulos Vencimento / Forma de Pagamento / Total (#BFBFBF). */
const BAND = rgb(191 / 255, 191 / 255, 191 / 255);
const WHITE = rgb(1, 1, 1);
const RED = rgb(0.75, 0, 0);

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

const charsets = new WeakMap<PDFFont, Set<number>>();

/**
 * Deixa o texto desenhável pela Helvetica.
 *
 * As fontes padrão do PDF usam WinAnsi, que cobre o português inteiro mas não
 * um emoji ou um ideograma — e o `pdf-lib` LANÇA ERRO diante de um caractere
 * que a fonte não tem. Um "?" no lugar de um símbolo exótico numa observação é
 * um problema pequeno; uma fatura que não sai é um problema grande.
 *
 * O `normalize('NFC')` vem primeiro: um texto colado de outro programa pode
 * trazer "ã" como "a" + til combinante (dois caracteres), e o til solto não
 * existe no WinAnsi — "São Paulo" sairia "Sa?o Paulo".
 *
 * Também junta espaços e quebras de linha: os campos de uma linha passam por
 * aqui inteiros; os de várias (descrição, observação) são quebrados por
 * parágrafo ANTES.
 */
function clean(text: string, font: PDFFont): string {
  let supported = charsets.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    charsets.set(font, supported);
  }

  let result = '';
  for (const char of text.normalize('NFC').replace(/\s+/g, ' ').trim()) {
    result += supported.has(char.codePointAt(0) ?? 0) ? char : '?';
  }

  return result;
}

/** Corta com reticências até caber na largura. */
function ellipsize(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;

  let result = text;
  while (result.length > 0 && font.widthOfTextAtSize(`${result}…`, size) > width) {
    result = result.slice(0, -1);
  }

  return `${result.trimEnd()}…`;
}

interface TextOptions {
  /** Âncora horizontal, em pixels do modelo. */
  x: number;
  /** Linha de base, em pixels do modelo. */
  y: number;
  size: number;
  bold?: boolean;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
  /**
   * Largura disponível, em pixels do modelo. O texto que não couber diminui
   * até `minSize` — nunca invade o campo vizinho.
   */
  maxWidth?: number;
  minSize?: number;
  /**
   * Linhas extras para o texto que não cabe numa só no `minSize`: ele quebra
   * em até `max` linhas e diminui até `minSize` para o bloco caber na faixa
   * livre em volta do campo — centrada em `center`, com `height` de altura
   * (pixels do modelo). Sem isto, o texto que não cabe é cortado com
   * reticências. Com isto, textos reais no limite do campo saem inteiros (os
   * testes conferem forma de pagamento de 80 caracteres e razão social de 180);
   * o corte fica para casos fora do comum — endereço com rua, número e
   * complemento todos no máximo, ou centenas de letras largas.
   */
  lines?: { max: number; center: number; height: number; minSize: number };
}

const LINE_GAP = 1.15;

/** Desenha uma linha já limpa na âncora horizontal e na linha de base dadas (em pontos). */
function place(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  options: TextOptions,
  baseline: number,
): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  const anchor = xAt(options.x);
  const x =
    options.align === 'center'
      ? anchor - textWidth / 2
      : options.align === 'right'
        ? anchor - textWidth
        : anchor;

  page.drawText(text, { x, y: baseline, size, font, color: options.color ?? BLACK });
}

function drawText(page: PDFPage, fonts: Fonts, raw: string, options: TextOptions): void {
  const font = options.bold ? fonts.bold : fonts.regular;
  const text = clean(raw, font);
  if (text === '') return;

  if (options.maxWidth === undefined) {
    place(page, font, text, options.size, options, yAt(options.y));
    return;
  }

  const width = px(options.maxWidth);
  const minSize = options.minSize ?? options.size;
  let size = options.size;

  while (size > minSize && font.widthOfTextAtSize(text, size) > width) {
    size = Math.max(minSize, size - 0.25);
  }

  if (font.widthOfTextAtSize(text, size) <= width || !options.lines) {
    place(page, font, ellipsize(text, font, size, width), size, options, yAt(options.y));
    return;
  }

  // Não coube numa linha: quebra e diminui até caber no número de linhas E na
  // altura da faixa.
  const band = options.lines;
  const fits = (lines: string[], s: number) =>
    lines.length <= band.max && blockHeight(lines.length, s) <= px(band.height);

  let lines = wrap(text, font, size, width);

  while (!fits(lines, size) && size > band.minSize) {
    size = Math.max(band.minSize, size - 0.25);
    lines = wrap(text, font, size, width);
  }

  if (!fits(lines, size)) {
    // Além do que os limites dos campos permitem: guarda as linhas que cabem.
    let capacity = Math.min(band.max, lines.length);
    while (capacity > 1 && blockHeight(capacity, size) > px(band.height)) capacity -= 1;

    lines = lines.slice(0, capacity);
    lines[capacity - 1] = ellipsize(`${lines[capacity - 1] ?? ''}…`, font, size, width);
  }

  // Centra o bloco na faixa: do topo das maiúsculas da primeira linha (0,72 do
  // corpo na Helvetica) ao fim das descendentes da última (0,21).
  const top = yAt(band.center) + blockHeight(lines.length, size) / 2;
  const firstBaseline = top - size * 0.72;

  lines.forEach((line, index) => {
    place(page, font, line, size, options, firstBaseline - index * size * LINE_GAP);
  });
}

/** Altura, em pontos, de um bloco de `count` linhas no corpo `size`. */
function blockHeight(count: number, size: number): number {
  return size * ((count - 1) * LINE_GAP + 0.93);
}

/**
 * Quebra um texto em linhas que cabem na largura (em pontos).
 *
 * Respeita as quebras de linha digitadas e parte uma palavra maior que a linha
 * inteira — um link ou uma chave PIX colada sem espaço — em vez de deixá-la
 * vazar pela borda.
 */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = clean(paragraph, font).split(' ').filter((word) => word !== '');
    let current = '';

    for (const word of words) {
      const candidate = current === '' ? word : `${current} ${word}`;

      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }

      if (current !== '') lines.push(current);

      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }

      current = rest;
    }

    if (current !== '') lines.push(current);
  }

  return lines;
}

const LEADING = 1.25;

/**
 * Encaixa um texto de várias linhas numa caixa de altura fixa.
 *
 * O modelo da fatura é um formulário: cada campo tem o seu retângulo, e nada
 * empurra o que vem abaixo. Por isso o texto longo DIMINUI até caber, em três
 * tentativas:
 *
 *   1. com as quebras de linha que a pessoa digitou;
 *   2. sem elas — os parágrafos viram um texto corrido separado por " · ". Seis
 *      linhas curtas de observação ocupam seis linhas da caixa; corridas,
 *      ocupam uma ou duas, e nada some;
 *   3. só então, no tamanho mínimo, as linhas finais viram reticências.
 *
 * O passo 3 não é alcançado dentro dos limites dos campos (descrição 255,
 * observação 500 caracteres) com texto comum — os testes conferem isso. Ele
 * existe para que um texto anormal (500 letras "W") ainda gere a fatura.
 */
function fitParagraph(
  text: string,
  font: PDFFont,
  maxSize: number,
  minSize: number,
  width: number,
  height: number,
): { size: number; lines: string[] } {
  const attempt = (source: string): { size: number; lines: string[] } | null => {
    for (let size = maxSize; size >= minSize; size -= 0.25) {
      const lines = wrap(source, font, size, width);
      if (lines.length * size * LEADING <= height) return { size, lines };
    }
    return null;
  };

  const asTyped = attempt(text);
  if (asTyped) return asTyped;

  const flowing = text
    .split(/\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .join(' · ');

  const merged = attempt(flowing);
  if (merged) return merged;

  const lines = wrap(flowing, font, minSize, width);
  const capacity = Math.max(1, Math.floor(height / (minSize * LEADING)));
  const kept = lines.slice(0, capacity);
  const last = kept[kept.length - 1];

  if (lines.length > capacity && last !== undefined) {
    kept[kept.length - 1] = ellipsize(`${last}…`, font, minSize, width);
  }

  return { size: minSize, lines: kept };
}

/** Desenha linhas já quebradas, a partir de `top` (pixels do modelo). */
function drawLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  size: number,
  left: number,
  top: number,
  color: RGB,
): number {
  const firstBaseline = PAGE_HEIGHT - MARGIN - px(top) - size;

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: xAt(left),
      y: firstBaseline - index * size * LEADING,
      size,
      font,
      color,
    });
  });

  // Devolve onde o bloco terminou, em pixels do modelo.
  return top + (lines.length * size * LEADING) / S;
}

// ---------------------------------------------------------------------------
// Formatação no padrão do modelo
// ---------------------------------------------------------------------------

/** O modelo usa pontos na data de vencimento: `10.10.2026`. */
function formatDotDate(iso: string): string {
  return formatIsoDateBr(iso).replaceAll('/', '.');
}

/** CEP como no modelo: `01.001-000`. */
function formatZipCode(digits: string | null): string {
  if (!digits) return '';
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`;
}

const upper = (value: string | null): string => (value ?? '').toLocaleUpperCase('pt-BR');

/** `R EXEMPLO TESTE N. 100 SALA 3`, como no modelo. */
function recipientAddress(client: InvoicePdfInput['client']): string {
  const parts = [
    client.street,
    client.number ? `N. ${client.number}` : null,
    client.complement,
  ].filter((part): part is string => Boolean(part && part.trim()));

  return upper(parts.join(' '));
}

/** `Av. das Nações, nº 1.000 - Sala 12`, como no modelo. */
function companyAddress(company: InvoicePdfInput['company']): string {
  if (!company.street) return '';

  return (
    company.street +
    (company.number ? `, nº ${company.number}` : '') +
    (company.complement ? ` - ${company.complement}` : '')
  );
}

/**
 * Linhas automáticas da observação, conforme a situação.
 *
 * Fatura pendente e em dia não ganha linha nenhuma — o campo fica como no
 * modelo. As demais situações precisam aparecer NO DOCUMENTO: uma fatura
 * cancelada ou já paga que circula sem essa indicação pode ser cobrada duas
 * vezes.
 */
function statusLines(invoice: InvoicePdfInput['invoice']): string[] {
  const lines: string[] = [];
  const paid = Number(invoice.paidAmount) > 0;
  const open = Number(invoice.outstanding) > 0;

  switch (invoice.status) {
    case 'CANCELLED':
      lines.push('Fatura cancelada — sem valor de cobrança.');
      return lines;
    case 'PAID':
      lines.push(
        invoice.lastPaymentDate
          ? `Fatura paga em ${formatIsoDateBr(invoice.lastPaymentDate)}.`
          : 'Fatura paga.',
      );
      return lines;
    case 'OVERDUE':
      lines.push(`Fatura vencida em ${formatIsoDateBr(invoice.dueDate)}.`);
      break;
    case 'PENDING':
      break;
  }

  if (paid && open) {
    lines.push(
      `Valor já pago: R$ ${formatMoneyBr(invoice.paidAmount)}. ` +
        `Saldo em aberto: R$ ${formatMoneyBr(invoice.outstanding)}.`,
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Blocos do formulário
// ---------------------------------------------------------------------------

interface Canvas {
  page: PDFPage;
  fonts: Fonts;
}

function hline(page: PDFPage, from: number, to: number, at: number, thickness = 0.8): void {
  page.drawLine({
    start: { x: xAt(from), y: yAt(at) },
    end: { x: xAt(to), y: yAt(at) },
    thickness,
    color: LINE,
  });
}

function vline(page: PDFPage, at: number, from: number, to: number, thickness = 0.8): void {
  page.drawLine({
    start: { x: xAt(at), y: yAt(from) },
    end: { x: xAt(at), y: yAt(to) },
    thickness,
    color: LINE,
  });
}

/** Fundos: o cinza do formulário, a faixa dos títulos e a caixa branca do logo. */
function drawBackground({ page }: Canvas): void {
  page.drawRectangle({
    x: xAt(0),
    y: yAt(MODEL_HEIGHT),
    width: px(MODEL_WIDTH),
    height: px(MODEL_HEIGHT),
    color: PAPER,
  });

  page.drawRectangle({ x: xAt(0), y: yAt(362), width: px(MODEL_WIDTH), height: px(12), color: BAND });

  page.drawRectangle({ x: xAt(84), y: yAt(64), width: px(94), height: px(63), color: WHITE });
}

/** Grade do formulário — desenhada por último, por cima dos fundos. */
function drawGrid({ page }: Canvas): void {
  page.drawRectangle({
    x: xAt(0),
    y: yAt(MODEL_HEIGHT),
    width: px(MODEL_WIDTH),
    height: px(MODEL_HEIGHT),
    borderColor: LINE,
    borderWidth: 1,
  });

  hline(page, 0, MODEL_WIDTH, 70); // fim do cabeçalho
  vline(page, 509, 0, 70); // empresa | número
  hline(page, 0, MODEL_WIDTH, 175); // fim do destinatário
  hline(page, 0, MODEL_WIDTH, 284); // fim do serviço
  hline(page, 0, MODEL_WIDTH, 350, 1.1); // fim da observação
  hline(page, 0, MODEL_WIDTH, 362); // títulos | valores
  hline(page, 0, MODEL_WIDTH, 379, 1.1); // fim da faixa de pagamento
  vline(page, 180, 350, 379);
  vline(page, 402, 350, 379);

  // Canhoto
  hline(page, 0, MODEL_WIDTH, 392);
  vline(page, 222, 392, 416);
  hline(page, 0, 509, 416);
  vline(page, 509, 379, MODEL_HEIGHT);
  hline(page, 0, MODEL_WIDTH, MODEL_HEIGHT, 1.6);
}

function drawLogo({ page, fonts }: Canvas, logo: PDFImage | null, companyName: string): void {
  // Caixa branca do modelo: x 84–178, y 1–64. Respiro de 5 px dentro dela.
  const box = { left: 84 + 5, top: 1 + 5, width: 94 - 10, height: 63 - 10 };

  if (logo) {
    const scale = Math.min(px(box.width) / logo.width, px(box.height) / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;

    page.drawImage(logo, {
      x: xAt(box.left) + (px(box.width) - width) / 2,
      y: yAt(box.top + box.height) + (px(box.height) - height) / 2,
      width,
      height,
    });
    return;
  }

  // Logo que o PDF não embute (SVG, WEBP, PNG grande demais): o nome ocupa a
  // caixa, em vez de a fatura sair com um retângulo branco vazio.
  drawText(page, fonts, companyName, {
    x: 84 + 47,
    y: 36,
    size: 9,
    bold: true,
    color: NAVY,
    align: 'center',
    maxWidth: box.width,
    minSize: 7,
    lines: { max: 4, center: 32.5, height: 52, minSize: 5 },
  });
}

function drawHeader(canvas: Canvas, input: InvoicePdfInput): void {
  const { page, fonts } = canvas;
  const { company, invoice } = input;

  // Bloco da empresa, centrado entre a caixa do logo e a divisória. Nome e
  // endereço longos quebram no espaço livre acima de cada linha.
  const center = 387;
  const width = 2 * Math.min(center - 178, 509 - center) - 8;
  const base = { x: center, size: 8, align: 'center' as const, maxWidth: width, minSize: 6.5 };

  drawText(page, fonts, company.name, {
    ...base,
    y: 18,
    lines: { max: 3, center: 14.5, height: 25, minSize: 5 },
  });
  drawText(page, fonts, companyAddress(company), {
    ...base,
    y: 46,
    lines: { max: 2, center: 43, height: 24, minSize: 5 },
  });
  if (company.cnpj) drawText(page, fonts, formatCpfCnpj(company.cnpj), { ...base, y: 66 });

  // Identificação da fatura, à direita.
  const right = { x: 587.5, align: 'center' as const, bold: true, maxWidth: 149 };

  drawText(page, fonts, 'FATURA DE SERVIÇOS', { ...right, y: 18, size: 9.5, minSize: 7 });
  drawText(page, fonts, `Nº: ${invoice.number}`, {
    ...right,
    y: 46,
    size: 11,
    minSize: 7,
    lines: { max: 2, center: 40.5, height: 35, minSize: 5.5 },
  });
  drawText(page, fonts, `Emissão: ${formatIsoDateBr(invoice.issueDate)}`, {
    x: 512,
    y: 67,
    size: 7.5,
    bold: true,
  });
}

function drawRecipient({ page, fonts }: Canvas, client: InvoicePdfInput['client']): void {
  const label = { size: 7.2, bold: true };
  const value = { size: 7.2, bold: true, color: NAVY, minSize: 6 };

  drawText(page, fonts, 'DESTINATÁRIO:', { ...label, x: 14, y: 84 });

  // Linha 1 — nome e documento. Uma razão social longa ganha até três linhas
  // no espaço entre o título e o endereço.
  drawText(page, fonts, upper(client.name), {
    ...value,
    x: 14,
    y: 106,
    maxWidth: 290,
    lines: { max: 3, center: 101.5, height: 27, minSize: 5 },
  });
  drawText(page, fonts, 'CNPJ / CPF:', { ...label, x: 310, y: 106, color: NAVY });
  drawText(page, fonts, formatCpfCnpj(client.cpfCnpj), { ...value, x: 405, y: 106, maxWidth: 250 });

  // Linha 2 — endereço, bairro e CEP
  drawText(page, fonts, 'Endereço', { ...label, x: 14, y: 132 });
  drawText(page, fonts, recipientAddress(client), {
    ...value,
    x: 70,
    y: 132,
    maxWidth: 236,
    lines: { max: 3, center: 129, height: 24, minSize: 5 },
  });
  drawText(page, fonts, 'Bairro', { ...label, x: 310, y: 132 });
  drawText(page, fonts, upper(client.neighborhood), {
    ...value,
    x: 404,
    y: 132,
    maxWidth: 103,
    lines: { max: 3, center: 129, height: 24, minSize: 5 },
  });
  drawText(page, fonts, 'CEP', { ...label, x: 511, y: 132 });
  drawText(page, fonts, formatZipCode(client.zipCode), { ...value, x: 572, y: 132, maxWidth: 88 });

  // Linha 3 — cidade e UF
  drawText(page, fonts, 'Cidade', { ...label, x: 14, y: 151 });
  drawText(page, fonts, upper(client.city), {
    ...value,
    x: 70,
    y: 151,
    maxWidth: 236,
  });
  drawText(page, fonts, 'UF', { ...label, x: 310, y: 151, color: NAVY });
  drawText(page, fonts, upper(client.state), { ...value, x: 404, y: 151, maxWidth: 103 });
}

function drawService({ page, fonts }: Canvas, invoice: InvoicePdfInput['invoice']): void {
  drawText(page, fonts, 'Serviço:', { x: 14, y: 187, size: 7.2, bold: true });

  // A descrição ocupa da margem até antes do "R$"; textos longos quebram em
  // linhas e diminuem até caber acima da linha do TOTAL.
  const { size, lines } = fitParagraph(
    invoice.service,
    fonts.regular,
    7.5,
    5.5,
    px(565 - 14),
    px(268 - 194),
  );
  drawLines(page, fonts.regular, lines, size, 14, 194.5, BLACK);

  // O valor tem a coluna dele, à direita do "R$"; um valor na casa dos bilhões
  // diminui a letra em vez de encostar no símbolo.
  const amount = formatMoneyBr(invoice.amount);
  const money = { size: 7.5, align: 'right' as const, maxWidth: 66, minSize: 5 };
  drawText(page, fonts, 'R$', { x: 577, y: 202, size: 7.5 });
  drawText(page, fonts, amount, { ...money, x: 658, y: 202 });

  drawText(page, fonts, 'TOTAL:', { x: 566, y: 280, size: 7.5, bold: true, align: 'right' });
  drawText(page, fonts, 'R$', { x: 577, y: 280, size: 7.5, bold: true });
  drawText(page, fonts, amount, { ...money, x: 657, y: 280, bold: true });
}

function drawNotes({ page, fonts }: Canvas, invoice: InvoicePdfInput['invoice']): void {
  drawText(page, fonts, 'Observação:', { x: 14, y: 293, size: 7.2, bold: true });

  const left = 14;
  const width = px(MODEL_WIDTH - left * 2);
  let top = 296;
  const bottom = 347;

  const automatic = statusLines(invoice).join(' ');
  if (automatic !== '') {
    const lines = wrap(automatic, fonts.bold, 7.5, width);
    top = drawLines(page, fonts.bold, lines, 7.5, left, top, NAVY);
  }

  if (invoice.notes && invoice.notes.trim() !== '') {
    const { size, lines } = fitParagraph(
      invoice.notes,
      fonts.regular,
      7.5,
      5.5,
      width,
      px(bottom - top),
    );
    drawLines(page, fonts.regular, lines, size, left, top, BLACK);
  }
}

function drawPaymentBar({ page, fonts }: Canvas, input: InvoicePdfInput): void {
  // A faixa tem 12 px no modelo: o título ocupa quase toda a altura, sem
  // encostar na linha de cima.
  const title = { size: 9.75, bold: true, align: 'center' as const, y: 360 };
  drawText(page, fonts, 'Vencimento', { ...title, x: 90 });
  drawText(page, fonts, 'Forma de Pagamento', { ...title, x: 291 });
  drawText(page, fonts, 'Total da Fatura', { ...title, x: 534 });

  const value = { size: 11, bold: true, y: 376 };
  drawText(page, fonts, formatDotDate(input.invoice.dueDate), {
    ...value,
    x: 90,
    align: 'center',
    color: NAVY,
  });
  // Até 80 caracteres ("PIX ... ou TED Banco ... Ag ... CC ..."): o que não cabe
  // numa linha quebra em duas, dentro da altura da faixa — nunca some um dígito
  // de conta.
  drawText(page, fonts, input.company.paymentInstructions ?? '', {
    ...value,
    x: 291,
    align: 'center',
    maxWidth: 212,
    minSize: 7,
    lines: { max: 2, center: 370.5, height: 14, minSize: 4.5 },
  });
  drawText(page, fonts, 'R$', { ...value, x: 412, color: NAVY });
  drawText(page, fonts, formatMoneyBr(input.invoice.amount), {
    ...value,
    x: 655,
    align: 'right',
    color: NAVY,
  });
}

/**
 * Canhoto: a tira que o cliente assina ao receber a fatura.
 *
 * No modelo, a frase traz "EMPRESA" em negrito — o lugar do nome de quem
 * emite. Aqui entra o nome cadastrado em Configurações.
 */
function drawStub({ page, fonts }: Canvas, input: InvoicePdfInput): void {
  const before = 'RECEBI(EMOS) DE ';
  const company = clean(upper(input.company.name), fonts.bold);
  const after = ' . OS VALORES CONSTANTES NESSA FATURA INDICADA AO LADO';

  // A frase inteira cabe numa linha do canhoto: um nome de empresa comprido
  // diminui a letra até 4 pt e, além disso, é cortado com reticências.
  let size = 5.8;
  const available = px(509 - 6);
  const fixedWidth = (s: number) => fonts.regular.widthOfTextAtSize(before + after, s);
  while (size > 4 && fixedWidth(size) + fonts.bold.widthOfTextAtSize(company, size) > available) {
    size -= 0.1;
  }

  const name = ellipsize(company, fonts.bold, size, available - fixedWidth(size));

  let x = xAt(3);
  const y = yAt(389);
  page.drawText(before, { x, y, size, font: fonts.regular, color: BLACK });
  x += fonts.regular.widthOfTextAtSize(before, size);
  page.drawText(name, { x, y, size, font: fonts.bold, color: BLACK });
  x += fonts.bold.widthOfTextAtSize(name, size);
  page.drawText(after, { x, y, size, font: fonts.regular, color: BLACK });

  drawText(page, fonts, 'FATURA DE SERVIÇOS', {
    x: 587.5,
    y: 389.5,
    size: 7.2,
    bold: true,
    align: 'center',
  });

  drawText(page, fonts, 'DATA DO RECEBIMENTO', { x: 3, y: 399, size: 5.8 });
  drawText(page, fonts, 'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', { x: 224, y: 399, size: 5.8 });

  drawText(page, fonts, `Nº: ${input.invoice.number}`, {
    x: 587.5,
    y: 411,
    size: 11,
    bold: true,
    align: 'center',
    maxWidth: 149,
    minSize: 7,
    lines: { max: 2, center: 407, height: 26, minSize: 5.5 },
  });
}

/**
 * Marca d'água de fatura paga ou cancelada.
 *
 * Fica no meio do formulário, inclinada e transparente: não esconde nenhum
 * dado, mas ninguém confunde o documento com uma cobrança em aberto.
 */
function drawStamp({ page, fonts }: Canvas, status: EffectiveInvoiceStatus): void {
  const stamp =
    status === 'PAID'
      ? { text: 'PAGA', color: NAVY, opacity: 0.1 }
      : status === 'CANCELLED'
        ? { text: 'CANCELADA', color: RED, opacity: 0.14 }
        : null;

  if (!stamp) return;

  const size = 64;
  const angle = 18;
  const radians = (angle * Math.PI) / 180;
  const width = fonts.bold.widthOfTextAtSize(stamp.text, size);
  const height = fonts.bold.heightAtSize(size, { descender: false });

  // `drawText` gira em torno da origem do texto; desloca a origem para o
  // CENTRO do texto girado cair no centro do formulário.
  const centerX = xAt(MODEL_WIDTH / 2);
  const centerY = yAt(MODEL_HEIGHT / 2);
  const x = centerX - (width / 2) * Math.cos(radians) + (height / 2) * Math.sin(radians);
  const y = centerY - (width / 2) * Math.sin(radians) - (height / 2) * Math.cos(radians);

  page.drawText(stamp.text, {
    x,
    y,
    size,
    font: fonts.bold,
    color: stamp.color,
    opacity: stamp.opacity,
    rotate: degrees(angle),
  });
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

/**
 * Logo que não abre (arquivo corrompido, PNG fora do padrão) não derruba a
 * fatura: ela sai com o nome da empresa na caixa do logo.
 */
async function embedLogo(pdf: PDFDocument, logo: InvoiceLogo | null): Promise<PDFImage | null> {
  if (!logo) return null;

  try {
    return logo.format === 'png' ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const now = new Date();

  pdf.setTitle(`Fatura ${input.invoice.number}`);
  pdf.setSubject(`Fatura de serviços — ${input.client.name}`);
  pdf.setAuthor(input.company.name);
  pdf.setCreator('Pro Accounting');
  pdf.setProducer('Pro Accounting');
  pdf.setLanguage('pt-BR');
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const canvas: Canvas = { page, fonts };
  const logo = await embedLogo(pdf, input.company.logo);

  drawBackground(canvas);
  drawStamp(canvas, input.invoice.status);
  drawLogo(canvas, logo, input.company.name);
  drawHeader(canvas, input);
  drawRecipient(canvas, input.client);
  drawService(canvas, input.invoice);
  drawNotes(canvas, input.invoice);
  drawPaymentBar(canvas, input);
  drawStub(canvas, input);
  drawGrid(canvas);

  return pdf.save();
}

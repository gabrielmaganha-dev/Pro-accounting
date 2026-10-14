import type { ReportCell, ReportColumnKind } from './types.js';

/**
 * Formatação de célula — compartilhada pelos três formatadores.
 *
 * Fica aqui, e não dentro de cada exportador, porque o valor impresso no PDF
 * precisa ser idêntico ao da planilha e ao da tela. Três implementações
 * separadas divergiriam no primeiro arredondamento, e a divergência só
 * apareceria quando alguém comparasse dois arquivos do mesmo relatório.
 */

/** `2026-09-23` -> `23/09/2026`. Devolve o próprio valor se não for uma data ISO. */
export function formatIsoDateBr(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * `1234.56` -> `1.234,56`.
 *
 * Feito sobre a string, não sobre `Number`: dinheiro chega como `Decimal`
 * serializado e converter para ponto flutuante só para formatar reintroduz o
 * erro de centavo que o `Decimal` existe para evitar.
 */
export function formatMoneyBr(value: string): string {
  const negative = value.startsWith('-');
  const [intPart = '0', decPart = '00'] = (negative ? value.slice(1) : value).split('.');

  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negative ? '-' : ''}${grouped},${decPart.padEnd(2, '0').slice(0, 2)}`;
}

/** Texto exibido na tela e impresso no PDF. */
export function formatCellText(value: ReportCell, kind: ReportColumnKind): string {
  if (value === null || value === undefined) return '';

  const text = String(value);

  switch (kind) {
    case 'money':
      return formatMoneyBr(text);
    case 'date':
      return formatIsoDateBr(text);
    case 'number':
      return text.replace('.', ',');
    default:
      return text;
  }
}

/**
 * Valor destinado a uma célula de planilha.
 *
 * Números vão como NÚMERO, não como texto. É a razão de existir a exportação
 * em Excel ao lado do CSV: quem abre a planilha quer somar a coluna de valores,
 * e um texto "1.234,56" não soma — ele fica alinhado à esquerda e some de
 * qualquer fórmula.
 */
export function toSpreadsheetValue(
  value: ReportCell,
  kind: ReportColumnKind,
): { type: 'number' | 'text'; value: string } {
  if (value === null || value === undefined) return { type: 'text', value: '' };

  const text = String(value);

  if (kind === 'money' || kind === 'number' || kind === 'integer') {
    // Ponto decimal: é o que o formato do arquivo exige. Quem escolhe a
    // vírgula é o Excel, na hora de exibir, conforme a configuração da máquina.
    return Number.isFinite(Number(text))
      ? { type: 'number', value: text }
      : { type: 'text', value: text };
  }

  if (kind === 'date') return { type: 'text', value: formatIsoDateBr(text) };

  return { type: 'text', value: text };
}

/** Alinhamento da coluna. Números à direita para as casas decimais se alinharem. */
export function alignmentFor(kind: ReportColumnKind): 'left' | 'right' {
  return kind === 'money' || kind === 'number' || kind === 'integer' ? 'right' : 'left';
}

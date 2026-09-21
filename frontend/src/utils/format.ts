/**
 * Formatação pt-BR.
 *
 * Os `Intl.*Format` são instanciados uma única vez no módulo: criar um
 * formatador é caro e, dentro de uma tabela com centenas de linhas, recriá-lo
 * a cada célula é perceptível.
 */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Versão compacta para os rótulos do eixo Y: R$ 12,5 mil.
 *
 * O eixo precisa de ordem de grandeza, não de centavos — "R$ 12.480,00"
 * repetido seis vezes na lateral rouba largura útil do gráfico e ninguém lê
 * os centavos ali. O valor exato aparece no tooltip.
 */
const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Valores monetários chegam da API como string (o Decimal do Prisma é
 * serializado assim de propósito, para não perder precisão passando por
 * `number`). Por isso aceitamos os dois tipos aqui.
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return currencyFormatter.format(0);

  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return currencyFormatter.format(0);

  return currencyFormatter.format(numeric);
}

export function formatCurrencyCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return compactCurrencyFormatter.format(0);

  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return compactCurrencyFormatter.format(0);

  return compactCurrencyFormatter.format(numeric);
}

/** Converte valor monetário em string (formato da API) para number, só para desenhar. */
export function toChartNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? parseApiDate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return '—';

  return dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? parseApiDate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return '—';

  return dateTimeFormatter.format(date);
}

/**
 * Converte data vinda da API em Date local.
 *
 * Uma data pura ("2026-03-10") interpretada por `new Date()` é tratada como
 * UTC meia-noite; no fuso do Brasil (UTC-3) isso exibe 09/03. Por isso strings
 * nesse formato são montadas componente a componente, no fuso local.
 */
function parseApiDate(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Aplica máscara de CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
export function formatCpfCnpj(digits: string | null | undefined): string {
  if (!digits) return '—';

  const onlyDigits = digits.replace(/\D/g, '');

  if (onlyDigits.length === 11) {
    return onlyDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (onlyDigits.length === 14) {
    return onlyDigits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  // Documento incompleto: melhor mostrar o que existe do que esconder o dado.
  return onlyDigits || '—';
}

/** Aplica máscara de telefone fixo ou celular. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return '—';

  const onlyDigits = digits.replace(/\D/g, '');

  if (onlyDigits.length === 11) {
    return onlyDigits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  if (onlyDigits.length === 10) {
    return onlyDigits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }

  return onlyDigits || '—';
}

/** Aplica máscara de CEP (00000-000). */
export function formatZipCode(digits: string | null | undefined): string {
  if (!digits) return '—';

  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length !== 8) return onlyDigits || '—';

  return onlyDigits.replace(/(\d{5})(\d{3})/, '$1-$2');
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/**
 * Tempo relativo: "há 2 dias", "ontem", "agora mesmo".
 *
 * Em uma lista de atividade recente isto lê melhor que a data absoluta — o
 * que importa é "isso acabou de acontecer" ou "isso é de semanas atrás", não
 * o dia exato. A data completa fica no atributo `title` para quem precisar.
 */
export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return 'agora mesmo';
  if (absSeconds < 3600) return relativeTimeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  if (absSeconds < 86_400) return relativeTimeFormatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (absSeconds < 2_592_000) return relativeTimeFormatter.format(Math.round(diffSeconds / 86_400), 'day');
  if (absSeconds < 31_536_000)
    return relativeTimeFormatter.format(Math.round(diffSeconds / 2_592_000), 'month');

  return relativeTimeFormatter.format(Math.round(diffSeconds / 31_536_000), 'year');
}

/** Iniciais para o avatar do topo ("Maria Silva" -> "MS"). */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return '?';

  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';

  return (first + last).toUpperCase();
}

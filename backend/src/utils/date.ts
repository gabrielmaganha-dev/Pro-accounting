/**
 * Utilitários de data para os cálculos do painel.
 *
 * O problema que este módulo resolve:
 *
 * As colunas `due_date`, `issue_date`, `payment_date`, `start_date` e
 * `end_date` são `DATE` no PostgreSQL — dia de calendário, sem hora e sem
 * fuso. O Prisma as devolve como Date de JavaScript posicionado à meia-noite
 * UTC.
 *
 * Já "hoje" é um conceito com fuso: às 21h de Brasília, em UTC já é o dia
 * seguinte. Se perguntássemos ao servidor a data local sem cuidado, toda
 * fatura que vence hoje apareceria como vencida a partir das 21h.
 *
 * Por isso: calcula-se o dia corrente NO FUSO DO ESCRITÓRIO e trabalha-se com
 * ele como string `YYYY-MM-DD`, que é passada ao SQL com cast explícito para
 * `date`. Assim a comparação acontece entre dois dias de calendário, sem
 * nenhuma conversão de fuso pelo caminho.
 */

/** Fuso de referência do escritório. */
export const APP_TIME_ZONE = 'America/Sao_Paulo';

/** Janela considerada "contrato próximo do vencimento". */
export const CONTRACT_EXPIRY_WINDOW_DAYS = 30;

/** Janela considerada "fatura vencendo em breve". */
export const INVOICE_DUE_SOON_WINDOW_DAYS = 7;

/** Quantidade de meses exibida nos gráficos históricos. */
export const CHART_MONTHS = 12;

/**
 * Data de hoje no fuso do escritório, como `YYYY-MM-DD`.
 *
 * `en-CA` é usado porque seu formato padrão é exatamente `YYYY-MM-DD`,
 * evitando montagem manual de string.
 */
export function today(timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Confere se a string é uma data de calendário real no formato `YYYY-MM-DD`.
 *
 * O formato sozinho não basta: "2026-02-30" e "2026-13-01" passam em qualquer
 * expressão regular e viram datas silenciosamente deslocadas quando o
 * JavaScript as normaliza (30/02 vira 02/03). Por isso a data é remontada e
 * comparada com a original — se o mês ou o dia mudaram, a entrada não existia.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Converte `YYYY-MM-DD` para Date à meia-noite UTC. */
export function isoDateToUtc(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

/** Formata um Date (meia-noite UTC) de volta para `YYYY-MM-DD`. */
export function utcToIsoDate(date: Date): string {
  const isoString = date.toISOString();
  return isoString.slice(0, 10);
}

/** Soma dias a uma data `YYYY-MM-DD`, devolvendo `YYYY-MM-DD`. */
export function addDays(isoDate: string, days: number): string {
  const date = isoDateToUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToIsoDate(date);
}

/** Primeiro dia do mês de uma data `YYYY-MM-DD`. */
export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Soma meses ao primeiro dia do mês, devolvendo `YYYY-MM-DD`. */
export function addMonths(isoDate: string, months: number): string {
  const date = isoDateToUtc(startOfMonth(isoDate));
  date.setUTCMonth(date.getUTCMonth() + months);
  return utcToIsoDate(date);
}

/**
 * Sequência contínua de chaves `YYYY-MM` terminando no mês de `isoDate`.
 *
 * Existe porque um `GROUP BY mês` só devolve meses que TÊM registro. Um
 * gráfico de 12 meses precisa mostrar também os meses vazios — senão um mês
 * sem faturamento simplesmente some do eixo e o gráfico mente sobre o
 * intervalo que está representando.
 */
export function lastMonthKeys(isoDate: string, months: number = CHART_MONTHS): string[] {
  const keys: string[] = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    keys.push(addMonths(isoDate, -offset).slice(0, 7));
  }

  return keys;
}

const MONTH_ABBREVIATIONS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/**
 * Rótulo curto do mês para o eixo do gráfico: `2026-03` -> `mar/26`.
 *
 * Gerado no backend de propósito: o mesmo rótulo é usado no gráfico e em
 * qualquer exportação futura, e não faz sentido duas implementações de
 * abreviação de mês divergirem entre as camadas.
 */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const abbreviation = MONTH_ABBREVIATIONS[(month ?? 1) - 1] ?? '???';
  const shortYear = String(year ?? 0).slice(-2);

  return `${abbreviation}/${shortYear}`;
}

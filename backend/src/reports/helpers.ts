import type { Prisma } from '@prisma/client';

import { isoDateToUtc } from '../utils/date.js';
import { formatIsoDateBr, formatMoneyBr } from './format.js';
import type { ReportFilters, ReportSummaryItem } from './types.js';

/**
 * Peças compartilhadas pelas definições de relatório.
 *
 * O que entra aqui é o que, repetido em quinze definições, garantiria que uma
 * delas ficasse diferente das outras — e um relatório que conta "atrasadas"
 * por um critério diferente do painel é pior do que relatório nenhum, porque
 * ninguém descobre qual dos dois está certo.
 */

/**
 * Recorte de datas para uma coluna `@db.Date`.
 *
 * As pontas são INCLUSIVAS: quem informa "de 01/09 a 30/09" espera o dia 30
 * dentro do resultado. Com `lt`, o último dia sumiria e o total fecharia
 * errado por um dia — o tipo de diferença que ninguém nota até alguém conferir
 * um mês inteiro na mão.
 */
export function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;

  return {
    ...(from ? { gte: isoDateToUtc(from) } : {}),
    ...(to ? { lte: isoDateToUtc(to) } : {}),
  };
}

/**
 * Linha de contexto impressa no topo de todo arquivo exportado.
 *
 * Um relatório sem os filtros impressos é um número sem procedência: quem o
 * recebe por e-mail não tem como saber se são as faturas do mês ou do ano, de
 * um cliente ou de todos. Como o arquivo circula fora do sistema, o contexto
 * precisa viajar junto com ele.
 */
export function describeFilters(
  filters: ReportFilters,
  periodField: string,
  clientName?: string | null,
  statusLabel?: string | null,
): string {
  const parts: string[] = [];

  if (filters.from && filters.to) {
    parts.push(`${periodField} de ${formatIsoDateBr(filters.from)} a ${formatIsoDateBr(filters.to)}`);
  } else if (filters.from) {
    parts.push(`${periodField} a partir de ${formatIsoDateBr(filters.from)}`);
  } else if (filters.to) {
    parts.push(`${periodField} até ${formatIsoDateBr(filters.to)}`);
  } else {
    parts.push(`${periodField}: todo o período`);
  }

  parts.push(clientName ? `Cliente: ${clientName}` : 'Todos os clientes');

  if (statusLabel) parts.push(`Situação: ${statusLabel}`);

  return parts.join(' · ');
}

/** Atalhos para os três tipos de número que aparecem nos resumos. */
export function moneySummary(label: string, value: string, hint?: string): ReportSummaryItem {
  return { label, value: `R$ ${formatMoneyBr(value)}`, kind: 'money', ...(hint ? { hint } : {}) };
}

export function countSummary(label: string, value: number, hint?: string): ReportSummaryItem {
  return { label, value: String(value), kind: 'integer', ...(hint ? { hint } : {}) };
}

export function textSummary(label: string, value: string, hint?: string): ReportSummaryItem {
  return { label, value, kind: 'text', ...(hint ? { hint } : {}) };
}

/** `Decimal | null` do Prisma para a string de duas casas que os tipos esperam. */
export function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return value ? value.toFixed(2) : '0.00';
}

/** Diferença em dias entre duas datas ISO. Positivo quando `to` é posterior. */
export function daysBetween(from: string, to: string): number {
  return Math.round((isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime()) / 86_400_000);
}

/** Trava de segurança: nenhum relatório devolve mais que isso de uma vez. */
export const REPORT_PAGE_SIZE_MAX = 100;

/**
 * Teto de linhas por exportação.
 *
 * Sem limite, exportar "todo o período" de um escritório grande montaria o
 * arquivo inteiro em memória e seguraria a conexão do banco enquanto isso. O
 * recado pede para estreitar o período — que é o que a pessoa faria de
 * qualquer forma para conseguir trabalhar no arquivo.
 */
export const REPORT_EXPORT_MAX_ROWS = 5000;

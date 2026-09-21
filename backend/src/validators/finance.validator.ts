import { z } from 'zod';

import { isValidIsoDate } from '../utils/date.js';

/**
 * Schemas do módulo financeiro.
 *
 * O período chega como um NOME (`month`, `year`, …), não como duas datas
 * resolvidas pelo navegador. A diferença importa: "este mês" depende do fuso
 * do escritório, e um usuário com o relógio do computador errado — ou em outro
 * fuso — veria um recorte diferente do colega ao lado, olhando o mesmo
 * sistema. Quem traduz o nome em intervalo é o servidor, uma vez só.
 */

const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, { message: 'Data inválida. Use o formato dia/mês/ano.' });

export const FINANCE_PERIODS = [
  'today',
  'week',
  'month',
  'previous-month',
  'year',
  'custom',
] as const;

export type FinancePeriod = (typeof FINANCE_PERIODS)[number];

const periodBase = z.object({
  period: z.enum(FINANCE_PERIODS).default('month'),

  /** Obrigatórios apenas quando `period` é `custom`. */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/**
 * Regras do período personalizado.
 *
 * As duas datas são exigidas juntas: um intervalo pela metade produziria um
 * recorte que o usuário não pediu — "de março até sempre" — e os totais
 * pareceriam errados sem nenhuma pista do motivo.
 */
const withCustomRules = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine(
      (data: z.infer<T>) => data.period !== 'custom' || (data.from && data.to),
      {
        message: 'Informe as datas inicial e final do período personalizado.',
        path: ['from'],
      },
    )
    .refine((data: z.infer<T>) => !data.from || !data.to || data.to >= data.from, {
      message: 'A data final não pode ser anterior à inicial.',
      path: ['to'],
    });

export const financeOverviewQuerySchema = withCustomRules(periodBase);

export type FinanceOverviewQuery = z.infer<typeof financeOverviewQuerySchema>;

export const financeEntriesQuerySchema = withCustomRules(
  periodBase.extend({
    /** Filtro adicional por situação efetiva da fatura. */
    status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
    clientId: z.string().trim().min(1).optional(),

    sort: z.enum(['dueDate', 'issueDate', 'amount', 'client']).default('dueDate'),
    order: z.enum(['asc', 'desc']).default('desc'),

    page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
    // Teto de 100: sem ele, `?pageSize=999999` seria uma negação de serviço
    // trivial contra o banco.
    pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
  }),
);

export type FinanceEntriesQuery = z.infer<typeof financeEntriesQuerySchema>;

/**
 * Formatos de exportação.
 *
 * Os três são aceitos pelo schema de propósito, embora só CSV esteja
 * implementado. Deixar `xlsx` e `pdf` visíveis no contrato — e respondendo
 * **501** com a mensagem dizendo o que já funciona — comunica que eles estão
 * previstos, em vez de devolver "valor inválido" e dar a impressão de que a
 * exportação nunca foi pensada.
 */
export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;

export const financeExportQuerySchema = withCustomRules(
  periodBase.extend({
    format: z.enum(EXPORT_FORMATS).default('csv'),
    status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
    clientId: z.string().trim().min(1).optional(),
  }),
);

export type FinanceExportQuery = z.infer<typeof financeExportQuerySchema>;

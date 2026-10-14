import { z } from 'zod';

import { isValidIsoDate } from '../utils/date.js';
import { REPORT_FORMATS } from '../reports/types.js';

/**
 * Schemas do módulo de relatórios.
 *
 * Um schema só para os quinze relatórios. O que varia entre eles — quais
 * situações fazem sentido, se o período se aplica — é declarado na definição e
 * usado pela interface para montar os controles. A API aceita qualquer
 * combinação e cada definição decide o que fazer com ela; recusar aqui exigiria
 * que o validador conhecesse os quinze relatórios, que é exatamente o
 * acoplamento que o catálogo existe para evitar.
 */

const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, { message: 'Data inválida. Use o formato dia/mês/ano.' });

const filtersBase = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  clientId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).max(40).optional(),

  page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
  // Teto de 100 por página, como no resto do sistema: sem ele,
  // `?pageSize=999999` seria uma negação de serviço trivial contra o banco.
  pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
});

/**
 * A data final não pode ser anterior à inicial.
 *
 * Sem esta regra o relatório voltaria vazio e pareceria um defeito do sistema,
 * quando o problema é uma data trocada — o erro mais comum de quem digita dois
 * campos de data seguidos.
 */
const withDateOrder = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((data: z.infer<T>) => !data.from || !data.to || data.to >= data.from, {
    message: 'A data final não pode ser anterior à inicial.',
    path: ['to'],
  });

export const reportQuerySchema = withDateOrder(filtersBase);

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const reportExportQuerySchema = withDateOrder(
  filtersBase.extend({
    format: z.enum(REPORT_FORMATS, {
      errorMap: () => ({ message: 'Formato inválido. Use csv, xlsx ou pdf.' }),
    }),
  }),
);

export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;

export const reportIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Identificador do relatório inválido.'),
});

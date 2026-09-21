import { z } from 'zod';

import { isValidIsoDate } from '../utils/date.js';
import { PAYMENT_METHODS } from './invoice.validator.js';

/**
 * Schemas do histórico de pagamentos.
 *
 * O módulo de pagamentos é de LEITURA. Não há criação nem edição aqui: um
 * pagamento nasce sempre vinculado a uma fatura, por `POST /invoices/:id/payment`,
 * e é desfeito por estorno na própria fatura. Um endpoint solto de criação
 * permitiria lançar dinheiro sem dizer a que cobrança ele se refere — que é
 * exatamente o registro que um escritório contábil precisa conseguir provar.
 */

const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, { message: 'Data inválida. Use o formato dia/mês/ano.' });

export const listPaymentsQuerySchema = z
  .object({
    /** Busca por número da fatura, nome do cliente ou observação. */
    search: z.string().trim().max(180).optional(),

    clientId: z.string().trim().min(1).optional(),
    invoiceId: z.string().trim().min(1).optional(),
    contractId: z.string().trim().min(1).optional(),

    paymentMethod: z.enum(PAYMENT_METHODS).optional(),

    /** Quem lançou — responde "o que a Maria registrou ontem". */
    registeredBy: z.string().trim().min(1).optional(),

    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),

    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),

    sort: z.enum(['paymentDate', 'amount', 'createdAt', 'client']).default('paymentDate'),
    order: z.enum(['asc', 'desc']).default('desc'),

    page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
    // Teto de 100: sem ele, `?pageSize=999999` seria uma negação de serviço
    // trivial contra o banco.
    pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom, {
    message: 'O fim do período não pode ser anterior ao início.',
    path: ['dateTo'],
  })
  .refine(
    (data) =>
      data.minAmount === undefined ||
      data.maxAmount === undefined ||
      data.maxAmount >= data.minAmount,
    { message: 'O valor máximo não pode ser menor que o mínimo.', path: ['maxAmount'] },
  );

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentIdOnlyParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
});

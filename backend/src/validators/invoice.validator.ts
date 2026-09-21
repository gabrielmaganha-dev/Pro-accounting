import { z } from 'zod';

import { isValidIsoDate } from '../utils/date.js';

/**
 * Schemas de entrada do módulo de faturas.
 *
 * Note o que NÃO está aqui: `status`. Nem na criação, nem na edição.
 *
 * A situação de uma fatura não é um campo que o formulário preenche — ela é
 * consequência de três coisas que o servidor conhece (a data de hoje, os
 * pagamentos lançados e o cancelamento). Aceitar `status` no corpo abriria
 * exatamente o que o enunciado pede para evitar: o frontend virando fonte da
 * regra. Cancelar passa por `PATCH /invoices/:id/status`; quitar acontece ao
 * registrar o pagamento.
 */

/** Data de calendário `YYYY-MM-DD`, conferida de verdade (30/02 é recusado). */
const isoDateSchema = z
  .string({ required_error: 'Informe a data.' })
  .trim()
  .refine(isValidIsoDate, { message: 'Data inválida. Use o formato dia/mês/ano.' });

/**
 * Valor monetário.
 *
 * Aceita número ou string porque o formulário envia texto e uma integração
 * futura mandaria número. O arredondamento para dois decimais acontece aqui, e
 * não no banco: deixar o PostgreSQL truncar silenciosamente esconderia do
 * usuário que "1500,005" virou "1500,00".
 */
const moneySchema = (label: string) =>
  z
    .union([z.string(), z.number()], {
      required_error: `Informe o ${label}.`,
      invalid_type_error: `${label} inválido.`,
    })
    .transform((value) => (typeof value === 'string' ? Number(value.trim()) : value))
    .refine((value) => Number.isFinite(value), { message: `${label} inválido.` })
    .refine((value) => value > 0, { message: `O ${label} precisa ser maior que zero.` })
    // Teto do Decimal(12,2) do banco. Sem esta checagem o Prisma recusaria com
    // um erro de overflow numérico, que não diz nada a quem preencheu o campo.
    .refine((value) => value <= 9_999_999_999.99, {
      message: `${label} acima do limite permitido.`,
    })
    .transform((value) => Math.round(value * 100) / 100);

/**
 * Texto opcional que distingue "não mexer" de "apagar".
 *
 *   ausente ....... undefined -> o serviço não toca no campo
 *   "" ou null .... null      -> o serviço grava NULL (apaga)
 *   texto ......... texto
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === null || value.length === 0 ? null : value;
    });

export const EFFECTIVE_INVOICE_STATUSES = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const;

export const PAYMENT_METHODS = ['PIX', 'BOLETO', 'TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;

export const createInvoiceSchema = z
  .object({
    clientId: z
      .string({ required_error: 'Selecione o cliente da fatura.' })
      .trim()
      .min(1, 'Selecione o cliente da fatura.'),

    /**
     * Opcional de propósito: o escritório também emite faturas avulsas, sem
     * contrato (uma certidão, um serviço pontual). Quando vem preenchido, o
     * serviço confere que o contrato existe E pertence ao cliente informado.
     */
    contractId: z.string().trim().min(1).nullable().optional(),

    /**
     * Número visível ao usuário. Normalizado para maiúsculas porque a
     * unicidade é do banco e é sensível a caixa: sem isto, "fat-2026-00001" e
     * "FAT-2026-00001" conviveriam como duas faturas diferentes.
     */
    number: z
      .string({ required_error: 'Informe o número da fatura.' })
      .trim()
      .toUpperCase()
      .min(1, 'Informe o número da fatura.')
      .max(30, 'Máximo de 30 caracteres.'),

    description: optionalText(255),

    amount: moneySchema('valor'),

    issueDate: isoDateSchema,
    dueDate: isoDateSchema,
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'O vencimento não pode ser anterior à data de emissão.',
    path: ['dueDate'],
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * Edição: todos os campos opcionais.
 *
 * O `.refine` de datas do schema de criação **não** sobrevive ao `.partial()`,
 * e nem poderia: numa edição que manda só `dueDate`, a emissão está no banco,
 * não no corpo. Quem compara as duas é `updateInvoice`, depois de juntar o que
 * veio com o que já estava gravado.
 */
export const updateInvoiceSchema = createInvoiceSchema.innerType().partial();

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

/** Cancelar ou reabrir. PAID e OVERDUE não entram: não são decisão de usuário. */
export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['CANCELLED', 'PENDING'], {
    invalid_type_error: 'Situação inválida.',
    required_error: 'Informe a nova situação.',
  }),
});

export const registerPaymentSchema = z.object({
  amount: moneySchema('valor do pagamento'),
  paymentDate: isoDateSchema,
  paymentMethod: z.enum(PAYMENT_METHODS, {
    required_error: 'Selecione a forma de pagamento.',
    invalid_type_error: 'Forma de pagamento inválida.',
  }),
  notes: optionalText(2000),

  /**
   * Libera o lançamento quando já existe um pagamento idêntico.
   *
   * A proteção contra duplicata precisa de uma saída, porque a coincidência
   * acontece de verdade: um cliente com duas faturas parceladas no mesmo valor
   * pode pagar as duas no mesmo dia, pelo mesmo PIX. Recusar sem alternativa
   * obrigaria o usuário a inventar um valor errado para conseguir lançar.
   *
   * O padrão é `false` de propósito — a confirmação é um ato deliberado, e
   * nunca o comportamento automático de um cliente HTTP que reenviou a
   * requisição.
   */
  confirmDuplicate: z.coerce.boolean().default(false),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

export const invoiceIdParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
});

export const paymentIdParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
  paymentId: z.string().min(1, 'Identificador do pagamento inválido.'),
});

/**
 * Parâmetros da listagem.
 *
 * `coerce` porque query string chega sempre como texto: `?page=2` vira a
 * string "2", e sem a conversão o Prisma receberia texto onde espera número.
 */
export const listInvoicesQuerySchema = z
  .object({
    /** Busca por número, descrição ou nome/documento do cliente. */
    search: z.string().trim().max(180).optional(),

    clientId: z.string().trim().min(1).optional(),
    contractId: z.string().trim().min(1).optional(),

    /** Inclui OVERDUE, que é derivado — o serviço traduz para a condição. */
    status: z.enum(EFFECTIVE_INVOICE_STATUSES).optional(),

    // Período de emissão e período de vencimento são filtros separados: "o que
    // emitimos em março" e "o que vence em março" são perguntas diferentes, e
    // um período só não responderia as duas.
    issueFrom: isoDateSchema.optional(),
    issueTo: isoDateSchema.optional(),
    dueFrom: isoDateSchema.optional(),
    dueTo: isoDateSchema.optional(),

    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),

    sort: z
      .enum(['number', 'issueDate', 'dueDate', 'amount', 'createdAt', 'client'])
      .default('dueDate'),
    order: z.enum(['asc', 'desc']).default('desc'),

    page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
    // Teto de 100: sem ele, `?pageSize=999999` seria uma negação de serviço
    // trivial contra o banco.
    pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
  })
  .refine((data) => !data.issueFrom || !data.issueTo || data.issueTo >= data.issueFrom, {
    message: 'O fim do período de emissão não pode ser anterior ao início.',
    path: ['issueTo'],
  })
  .refine((data) => !data.dueFrom || !data.dueTo || data.dueTo >= data.dueFrom, {
    message: 'O fim do período de vencimento não pode ser anterior ao início.',
    path: ['dueTo'],
  })
  .refine(
    (data) => data.minAmount === undefined || data.maxAmount === undefined || data.maxAmount >= data.minAmount,
    { message: 'O valor máximo não pode ser menor que o mínimo.', path: ['maxAmount'] },
  );

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const invoiceHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

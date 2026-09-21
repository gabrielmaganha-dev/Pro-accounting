import { z } from 'zod';

import { isValidIsoDate } from '../utils/date.js';

/**
 * Schemas de entrada do módulo de contratos.
 *
 * Três regras concentram quase toda a validação aqui:
 *
 *  1. **Contrato sem cliente não existe.** `clientId` é obrigatório e a
 *     existência do cliente é conferida no serviço — o schema garante apenas
 *     que o campo veio preenchido.
 *  2. **Valor mensal é dinheiro**, nunca negativo e nunca zero. Um contrato de
 *     R$ 0,00 não é um contrato; é um cadastro pela metade que geraria faturas
 *     de valor nulo mês após mês.
 *  3. **Data final nunca antes da inicial.** Conferida aqui na criação, onde
 *     as duas datas chegam juntas, e de novo no serviço na edição, onde uma
 *     delas pode vir sozinha e precisa ser comparada com a que está gravada.
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
const monthlyValueSchema = z
  .union([z.string(), z.number()], {
    required_error: 'Informe o valor mensal.',
    invalid_type_error: 'Valor mensal inválido.',
  })
  .transform((value) => (typeof value === 'string' ? Number(value.trim()) : value))
  .refine((value) => Number.isFinite(value), { message: 'Valor mensal inválido.' })
  .refine((value) => value > 0, {
    message: 'O valor mensal precisa ser maior que zero.',
  })
  // Teto do Decimal(12,2) do banco. Sem esta checagem o Prisma recusaria com
  // um erro de overflow numérico, que não diz nada a quem preencheu o campo.
  .refine((value) => value <= 9_999_999_999.99, {
    message: 'Valor mensal acima do limite permitido.',
  })
  .transform((value) => Math.round(value * 100) / 100);

const dueDaySchema = z.coerce
  .number({
    required_error: 'Informe o dia de vencimento.',
    invalid_type_error: 'Dia de vencimento inválido.',
  })
  .int('O dia de vencimento precisa ser um número inteiro.')
  .min(1, 'O dia de vencimento vai de 1 a 31.')
  .max(31, 'O dia de vencimento vai de 1 a 31.');

/**
 * Texto opcional que distingue "não mexer" de "apagar".
 *
 * A diferença importa na edição. Se campo ausente e campo vazio virassem os
 * dois `undefined`, limpar as observações de um contrato seria impossível: o
 * serviço interpretaria o `""` como "o formulário não mandou este campo" e
 * manteria o texto antigo gravado, sem nenhum aviso de que a limpeza falhou.
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

export const CONTRACT_STATUSES = ['ACTIVE', 'PENDING', 'RENEWAL', 'CLOSED', 'CANCELLED'] as const;

const contractStatusSchema = z.enum(CONTRACT_STATUSES, {
  invalid_type_error: 'Situação inválida.',
});

export const createContractSchema = z
  .object({
    clientId: z
      .string({ required_error: 'Selecione o cliente do contrato.' })
      .trim()
      .min(1, 'Selecione o cliente do contrato.'),

    /**
     * Número visível ao usuário. Normalizado para maiúsculas porque a
     * unicidade é do banco e é sensível a caixa: sem isto, "ct-2026-0001" e
     * "CT-2026-0001" conviveriam como dois contratos diferentes.
     */
    number: z
      .string({ required_error: 'Informe o número do contrato.' })
      .trim()
      .toUpperCase()
      .min(1, 'Informe o número do contrato.')
      .max(30, 'Máximo de 30 caracteres.'),

    serviceType: z
      .string({ required_error: 'Informe o tipo de serviço.' })
      .trim()
      .min(2, 'Informe o tipo de serviço (mínimo 2 caracteres).')
      .max(120, 'Máximo de 120 caracteres.'),

    startDate: isoDateSchema,

    /**
     * Nulo/ausente = prazo indeterminado, que é o contrato de honorários
     * mensais mais comum em escritório contábil. Por isso o campo é opcional
     * e `null` é um valor legítimo, não um erro de preenchimento.
     */
    endDate: isoDateSchema.nullish(),

    monthlyValue: monthlyValueSchema,
    dueDay: dueDaySchema,

    status: contractStatusSchema.default('ACTIVE'),
    notes: optionalText(2000),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'A data de término não pode ser anterior à data de início.',
    path: ['endDate'],
  });

export type CreateContractInput = z.infer<typeof createContractSchema>;

/**
 * Edição: todos os campos opcionais.
 *
 * O `.refine` de datas do schema de criação **não** sobrevive ao `.partial()`,
 * e nem poderia: numa edição que manda só `endDate`, a data de início está no
 * banco, não no corpo. Quem compara as duas é `updateContract`, depois de
 * juntar o que veio com o que já estava gravado.
 */
export const updateContractSchema = createContractSchema.innerType().partial();

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const updateContractStatusSchema = z.object({
  status: contractStatusSchema,
});

/**
 * Renovação: estende a vigência do contrato existente.
 *
 * Pede a nova data de término e, opcionalmente, o novo valor mensal — reajuste
 * é a razão mais comum de uma renovação não ser apenas uma prorrogação de
 * prazo.
 */
export const renewContractSchema = z.object({
  endDate: isoDateSchema,
  monthlyValue: monthlyValueSchema.optional(),
});

export type RenewContractInput = z.infer<typeof renewContractSchema>;

export const contractIdParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
});

/**
 * Parâmetros da listagem.
 *
 * `coerce` porque query string chega sempre como texto: `?page=2` vira a
 * string "2", e sem a conversão o Prisma receberia texto onde espera número.
 */
export const listContractsQuerySchema = z.object({
  /** Busca por número, tipo de serviço ou nome/documento do cliente. */
  search: z.string().trim().max(180).optional(),
  status: contractStatusSchema.optional(),
  clientId: z.string().trim().min(1).optional(),

  /**
   * Contratos que terminam nos próximos N dias — é o filtro por trás do alerta
   * "contratos vencendo" do painel. Contratos por prazo indeterminado ficam de
   * fora por definição: sem data de término, não há o que vencer.
   */
  expiringInDays: z.coerce.number().int().min(1).max(365).optional(),

  sort: z
    .enum(['number', 'startDate', 'endDate', 'monthlyValue', 'createdAt', 'client'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),

  page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
  // Teto de 100: sem ele, `?pageSize=999999` seria uma negação de serviço
  // trivial contra o banco.
  pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
});

export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

/** Faturas do contrato — paginadas e com filtro opcional por situação. */
export const contractInvoicesQuerySchema = z.object({
  // Inclui OVERDUE, que não existe no banco: é derivado da data de
  // vencimento. O serviço traduz esse filtro para a condição correta.
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

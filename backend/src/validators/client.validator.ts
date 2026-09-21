import { z } from 'zod';

import { BRAZILIAN_STATES, isValidCpfCnpj, onlyDigits } from '../utils/document.js';

/**
 * Schemas de entrada do módulo de clientes.
 *
 * Princípio adotado em todos eles: a API guarda o dado LIMPO e devolve o dado
 * limpo. Máscara é assunto da interface.
 *
 * Gravar "123.456.789-00" formatado quebraria três coisas de uma vez: a busca
 * (quem digita só números não acha), a unicidade (o mesmo CPF entraria duas
 * vezes com máscaras diferentes) e qualquer integração futura com a Receita.
 * Por isso os campos de documento, telefone e CEP passam por `onlyDigits`
 * antes de qualquer validação.
 */

/** Converte string vazia em undefined — formulário HTML manda "" e não null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

const cpfCnpjSchema = z
  .string({ required_error: 'Informe o CPF ou CNPJ.' })
  .transform(onlyDigits)
  .refine((digits) => digits.length === 11 || digits.length === 14, {
    message: 'O CPF deve ter 11 dígitos e o CNPJ, 14.',
  })
  .refine(isValidCpfCnpj, {
    // Dígito verificador conferido de verdade: pega o número digitado errado,
    // que é o erro mais comum e o mais caro de descobrir tarde.
    message: 'CPF ou CNPJ inválido. Confira os números digitados.',
  });

const phoneSchema = z
  .string()
  .transform(onlyDigits)
  .refine((digits) => digits.length === 0 || digits.length === 10 || digits.length === 11, {
    message: 'Telefone deve ter 10 dígitos (fixo) ou 11 (celular), com DDD.',
  })
  .transform((digits) => (digits.length === 0 ? undefined : digits))
  .optional();

const zipCodeSchema = z
  .string()
  .transform(onlyDigits)
  .refine((digits) => digits.length === 0 || digits.length === 8, {
    message: 'CEP deve ter 8 dígitos.',
  })
  .transform((digits) => (digits.length === 0 ? undefined : digits))
  .optional();

const stateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value.length === 0 || (BRAZILIAN_STATES as readonly string[]).includes(value), {
    message: 'UF inválida.',
  })
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, {
    message: 'Informe um e-mail válido.',
  })
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const createClientSchema = z.object({
  name: z
    .string({ required_error: 'Informe o nome ou a razão social.' })
    .trim()
    .min(2, 'O nome precisa ter ao menos 2 caracteres.')
    .max(180, 'Máximo de 180 caracteres.'),

  companyName: optionalText(180),
  cpfCnpj: cpfCnpjSchema,

  /// Texto livre: o formato varia por UF e "ISENTO" é valor legítimo.
  stateRegistration: optionalText(20),

  email: emailSchema,
  phone: phoneSchema,
  whatsapp: phoneSchema,

  // Endereço desmembrado — exigência de emissão fiscal.
  zipCode: zipCodeSchema,
  street: optionalText(180),
  number: optionalText(20),
  complement: optionalText(120),
  neighborhood: optionalText(120),
  city: optionalText(120),
  state: stateSchema,

  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: optionalText(2000),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

/**
 * Atualização: todos os campos opcionais, INCLUSIVE `status`.
 *
 * O status aparece no formulário de edição, então precisa ser aceito aqui.
 * Duas salvaguardas continuam valendo:
 *
 *  • só ADMIN pode alterá-lo (a checagem está no serviço, campo a campo);
 *  • a mudança é registrada no histórico como ATIVADO/INATIVADO, e não como
 *    uma alteração genérica de campo, para a auditoria continuar legível.
 *
 * A rota dedicada `PATCH /clients/:id/status` permanece: é ela que os botões
 * "Inativar"/"Reativar" da ficha usam, sem precisar reenviar o cadastro todo.
 */
export const updateClientSchema = createClientSchema.partial();

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const updateClientStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE'], {
    required_error: 'Informe a nova situação.',
    invalid_type_error: 'Situação inválida.',
  }),
});

/**
 * Parâmetros da listagem.
 *
 * `coerce` porque query string chega sempre como texto: `?page=2` vira a
 * string "2", e sem a conversão o Prisma receberia texto onde espera número.
 */
export const listClientsQuerySchema = z.object({
  search: z.string().trim().max(180).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  state: z.string().trim().toUpperCase().length(2).optional(),
  city: z.string().trim().max(120).optional(),

  sort: z.enum(['name', 'createdAt', 'updatedAt', 'city']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),

  page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
  // Teto de 100: sem ele, `?pageSize=999999` seria uma negação de serviço
  // trivial contra o banco.
  pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const clientIdParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Faturas do cliente — paginadas e com filtro opcional por situação. */
export const clientInvoicesQuerySchema = z.object({
  // Inclui OVERDUE, que não existe no banco: é derivado da data de
  // vencimento. O serviço traduz esse filtro para a condição correta.
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

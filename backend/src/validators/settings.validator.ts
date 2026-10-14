import { z } from 'zod';

import { BRAZILIAN_STATES, isValidCpfCnpj, onlyDigits } from '../utils/document.js';

/**
 * Schemas da configuração do sistema.
 *
 * Mesma regra do cadastro de clientes: a API guarda o dado LIMPO. Documento,
 * telefone e CEP passam por `onlyDigits` antes de qualquer validação, porque
 * gravar "12.345.678/0001-90" formatado quebraria busca, unicidade e qualquer
 * integração futura.
 */

/** Converte string vazia em `undefined` — formulário HTML manda "", não null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

const cnpjSchema = z
  .string()
  .transform(onlyDigits)
  .refine((digits) => digits.length === 0 || digits.length === 14, {
    message: 'O CNPJ precisa ter 14 dígitos.',
  })
  .refine((digits) => digits.length === 0 || isValidCpfCnpj(digits), {
    message: 'CNPJ inválido. Confira os números digitados.',
  })
  .transform((digits) => (digits.length === 0 ? undefined : digits))
  .optional();

const phoneSchema = z
  .string()
  .transform(onlyDigits)
  .refine((d) => d.length === 0 || d.length === 10 || d.length === 11, {
    message: 'Telefone deve ter 10 dígitos (fixo) ou 11 (celular), com DDD.',
  })
  .transform((d) => (d.length === 0 ? undefined : d))
  .optional();

const zipCodeSchema = z
  .string()
  .transform(onlyDigits)
  .refine((d) => d.length === 0 || d.length === 8, { message: 'CEP deve ter 8 dígitos.' })
  .transform((d) => (d.length === 0 ? undefined : d))
  .optional();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v.length === 0 || z.string().email().safeParse(v).success, {
    message: 'Informe um e-mail válido.',
  })
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const websiteSchema = z
  .string()
  .trim()
  .max(200, 'Máximo de 200 caracteres.')
  .refine(
    (v) => v.length === 0 || /^https?:\/\/[^\s]+\.[^\s]+$/.test(v),
    // Exigir o esquema evita um link que o navegador trataria como caminho
    // relativo do próprio sistema — "proaccounting.com.br" viraria
    // "localhost:5173/proaccounting.com.br" ao ser clicado.
    { message: 'Informe o endereço completo, começando com http:// ou https://.' },
  )
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const stateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v.length === 0 || (BRAZILIAN_STATES as readonly string[]).includes(v), {
    message: 'UF inválida.',
  })
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

export const updateCompanySchema = z.object({
  companyName: z
    .string({ required_error: 'Informe o nome da empresa.' })
    .trim()
    .min(2, 'O nome precisa ter ao menos 2 caracteres.')
    .max(180, 'Máximo de 180 caracteres.'),

  companyCnpj: cnpjSchema,
  companyEmail: emailSchema,
  companyPhone: phoneSchema,
  companyWebsite: websiteSchema,

  companyZipCode: zipCodeSchema,
  companyStreet: optionalText(180),
  companyNumber: optionalText(20),
  companyComplement: optionalText(120),
  companyNeighborhood: optionalText(120),
  companyCity: optionalText(120),
  companyState: stateSchema,
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

/** Cor hexadecimal de 6 dígitos, normalizada em minúsculas. */
const hexColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'Use uma cor no formato #RRGGBB.');

/**
 * Tamanho máximo do logotipo: 400 KB já em base64.
 *
 * O corpo da requisição é limitado a 1 MB no servidor; o teto aqui fica
 * confortavelmente abaixo para que a recusa venha com uma mensagem explicando
 * o problema, em vez de a conexão ser cortada pelo limite genérico — que o
 * usuário leria como "o sistema travou ao enviar a imagem".
 *
 * 400 KB é generoso para uma marca: um PNG de 512×512 com fundo transparente
 * costuma ficar abaixo de 60 KB.
 */
const LOGO_MAX_BASE64_LENGTH = 400 * 1024;

/**
 * Formatos aceitos.
 *
 * SVG entra porque é o formato natural de um logotipo — escala sem perder
 * nitidez em qualquer tamanho. Ele é renderizado exclusivamente via `<img>`,
 * contexto em que o navegador não executa script embutido no arquivo; fosse
 * injetado inline no HTML, seria um vetor de XSS.
 */
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

const logoSchema = z
  .string()
  .trim()
  .max(LOGO_MAX_BASE64_LENGTH, 'A imagem é grande demais. Use um arquivo de até 400 KB.')
  .refine((value) => LOGO_PATTERN.test(value), {
    message: 'Envie uma imagem PNG, JPEG, WEBP ou SVG.',
  });

export const updateAppearanceSchema = z.object({
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),

  /**
   * `null` remove o logotipo; ausente mantém o atual.
   *
   * Sem a distinção entre "não mandei" e "mandei vazio" não haveria como voltar
   * ao símbolo padrão depois de enviar uma marca — só sobrescrevendo por outra.
   */
  logo: logoSchema.nullable().optional(),
});

export type UpdateAppearanceInput = z.infer<typeof updateAppearanceSchema>;

/**
 * Fusos aceitos.
 *
 * Lista fechada em vez de texto livre: um fuso inválido faria `Intl` lançar
 * exceção dentro de `today()`, que é chamada em praticamente toda requisição —
 * um erro de digitação aqui derrubaria o sistema inteiro, não só esta tela.
 * São os fusos do Brasil, que é o alcance do produto.
 */
export const SUPPORTED_TIME_ZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Cuiaba',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Rio_Branco',
  'America/Boa_Vista',
  'America/Porto_Velho',
  'America/Campo_Grande',
  'America/Noronha',
] as const;

/** Moedas aceitas — códigos ISO 4217. */
export const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

/** Formatos de data aceitos, na notação que a interface entende. */
export const SUPPORTED_DATE_FORMATS = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd'] as const;

export const updateGeneralSchema = z.object({
  /**
   * Antecedência do aviso de vencimento.
   *
   * Mínimo 1: zero transformaria o aviso de "vai vencer" em "venceu", que é o
   * outro alerta. Máximo 90: uma janela maior que um trimestre marcaria quase
   * toda fatura em aberto como "vencendo em breve" e o alerta deixaria de
   * distinguir o que é urgente.
   */
  dueSoonDays: z.coerce
    .number({ invalid_type_error: 'Informe um número de dias.' })
    .int('Informe um número inteiro de dias.')
    .min(1, 'O aviso precisa de ao menos 1 dia de antecedência.')
    .max(90, 'Máximo de 90 dias de antecedência.'),

  currency: z.enum(SUPPORTED_CURRENCIES, {
    errorMap: () => ({ message: 'Moeda não suportada.' }),
  }),

  timeZone: z.enum(SUPPORTED_TIME_ZONES, {
    errorMap: () => ({ message: 'Fuso horário não suportado.' }),
  }),

  dateFormat: z.enum(SUPPORTED_DATE_FORMATS, {
    errorMap: () => ({ message: 'Formato de data não suportado.' }),
  }),
});

export type UpdateGeneralInput = z.infer<typeof updateGeneralSchema>;

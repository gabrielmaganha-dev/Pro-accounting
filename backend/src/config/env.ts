import 'dotenv/config';
import { z } from 'zod';

/**
 * Contrato das variáveis de ambiente.
 *
 * A validação acontece na importação deste módulo — ou seja, antes de o
 * servidor abrir a porta. Um `.env` incompleto derruba o processo com uma
 * mensagem dizendo exatamente qual variável está faltando, em vez de produzir
 * um erro obscuro trinta minutos depois, na primeira requisição.
 */
const envSchema = z.object({
  // --- Aplicação -----------------------------------------------------------
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3333),
  HOST: z.string().min(1).default('0.0.0.0'),

  // --- Banco de dados ------------------------------------------------------
  DATABASE_URL: z
    .string({ required_error: 'obrigatória — veja backend/.env.example' })
    .min(1, 'obrigatória — veja backend/.env.example')
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'deve ser uma string de conexão PostgreSQL (postgresql://usuario:senha@host:porta/banco)',
    }),

  // --- Autenticação --------------------------------------------------------
  JWT_SECRET: z
    .string({ required_error: 'obrigatório — gere um valor aleatório' })
    .min(32, 'deve ter no mínimo 32 caracteres para ser resistente a força bruta'),
  JWT_EXPIRES_IN: z
    .string()
    .min(1)
    .regex(/^\d+[smhd]$/, 'use o formato 15m, 2h, 1d ou 7d')
    .default('1d'),
  BCRYPT_SALT_ROUNDS: z.coerce
    .number()
    .int()
    .min(10, 'abaixo de 10 o hash fica rápido demais para ser seguro')
    .max(15, 'acima de 15 o login fica lento demais na prática')
    .default(12),

  // --- CORS ----------------------------------------------------------------
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  // --- Seed do administrador -----------------------------------------------
  // Opcionais aqui de propósito: só o script de seed precisa delas, e a API
  // não deve se recusar a subir por causa de uma variável que ela não usa.
  // O próprio seed valida a presença e explica o que falta.
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email('precisa ser um e-mail válido').optional(),
  ADMIN_PASSWORD: z.string().min(8, 'deve ter no mínimo 8 caracteres').optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `   • ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n');

  console.error(
    [
      '',
      '  Não foi possível iniciar: variáveis de ambiente inválidas.',
      '',
      details,
      '',
      '  Copie backend/.env.example para backend/.env e preencha os valores.',
      '',
    ].join('\n'),
  );

  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDevelopment: raw.NODE_ENV === 'development',
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',

  /** CORS_ORIGIN aceita várias origens separadas por vírgula. */
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
} as const;

export type Env = typeof env;

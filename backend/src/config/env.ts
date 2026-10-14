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
  // Sem padrão aqui: o padrão de desenvolvimento é aplicado mais abaixo, só
  // fora de produção. Em produção a ausência é erro — ver `productionIssues`.
  CORS_ORIGIN: z.string().min(1).optional(),

  // --- Operação ------------------------------------------------------------
  /**
   * Nível mínimo do log. Em produção o log sai em JSON, uma linha por evento,
   * na saída padrão — é o formato que o Docker e qualquer coletor esperam.
   */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Confiar nos cabeçalhos `X-Forwarded-*`.
   *
   * `true` quando a API fica ATRÁS de um proxy (nginx, Caddy) que os define —
   * é o que faz o limite de requisições e a auditoria enxergarem o IP real do
   * visitante, e não o do proxy. `false` se a porta da API for exposta direto
   * à internet: nesse caso qualquer um forjaria o cabeçalho e escaparia do
   * limite de tentativas de login trocando de "IP" a cada requisição.
   */
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),

  // --- Seed do administrador -----------------------------------------------
  // Opcionais aqui de propósito: só o script de seed precisa delas, e a API
  // não deve se recusar a subir por causa de uma variável que ela não usa.
  // O próprio seed valida a presença e explica o que falta.
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email('precisa ser um e-mail válido').optional(),
  ADMIN_PASSWORD: z.string().min(8, 'deve ter no mínimo 8 caracteres').optional(),
});

/**
 * Variável definida mas VAZIA conta como ausente.
 *
 * No Docker Compose, `ADMIN_EMAIL: ${ADMIN_EMAIL:-}` entrega uma string vazia
 * quando o valor não foi preenchido — e uma string vazia não é "indefinida":
 * falharia na validação de e-mail e impediria a API de subir por causa de uma
 * variável que ela nem usa. Descartando as vazias, o opcional continua
 * opcional e o padrão de cada variável volta a valer.
 */
const definedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
);

const parsed = envSchema.safeParse(definedEnv);

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
const isProduction = raw.NODE_ENV === 'production';

/** Padrão de desenvolvimento: a porta do Vite. Nunca vale em produção. */
const DEV_CORS_ORIGIN = 'http://localhost:5173';

/**
 * CORS_ORIGIN aceita várias origens separadas por vírgula.
 *
 * A barra final é removida: o navegador envia `https://app.exemplo.com`, sem
 * barra, e a comparação é por igualdade exata — `https://app.exemplo.com/` na
 * configuração recusaria todas as requisições sem nenhuma mensagem de erro.
 */
const corsOrigins = (raw.CORS_ORIGIN ?? (isProduction ? '' : DEV_CORS_ORIGIN))
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter((origin) => origin.length > 0);

/**
 * Verificações que só fazem sentido com o conjunto completo de variáveis.
 *
 * As de produção existem porque os valores de exemplo dos `.env.example` são
 * válidos pelo formato — têm 32 caracteres, parecem uma URL — e passariam pela
 * validação acima. Subir a produção com o segredo do exemplo, que está
 * publicado no repositório, equivale a não ter segredo: qualquer pessoa
 * assinaria um token de administrador.
 */
function crossFieldIssues(): string[] {
  const issues: string[] = [];

  for (const origin of corsOrigins) {
    let valid = false;
    try {
      // Uma origem é esquema + host (+ porta), e mais nada. `new URL().origin`
      // devolve exatamente isso; se diferir do que foi escrito, havia caminho,
      // curinga ou erro de digitação.
      valid = new URL(origin).origin === origin;
    } catch {
      valid = false;
    }

    if (!valid) {
      issues.push(
        `CORS_ORIGIN: "${origin}" não é uma origem válida — use esquema + domínio, ` +
          'sem caminho e sem curinga (ex.: https://app.suaempresa.com.br)',
      );
    }
  }

  if (!isProduction) return issues;

  if (corsOrigins.length === 0) {
    issues.push(
      'CORS_ORIGIN: obrigatória em produção — o endereço público do sistema ' +
        '(ex.: https://app.suaempresa.com.br)',
    );
  }

  if (/troque/i.test(raw.JWT_SECRET)) {
    issues.push(
      'JWT_SECRET: ainda é o valor de exemplo. Gere um segredo aleatório: openssl rand -base64 48',
    );
  }

  if (/troque-esta-senha/i.test(raw.DATABASE_URL)) {
    issues.push('DATABASE_URL: ainda usa a senha de exemplo ("troque-esta-senha")');
  }

  return issues;
}

const crossIssues = crossFieldIssues();

if (crossIssues.length > 0) {
  console.error(
    [
      '',
      '  Não foi possível iniciar: configuração insegura ou inválida.',
      '',
      ...crossIssues.map((issue) => `   • ${issue}`),
      '',
    ].join('\n'),
  );

  process.exit(1);
}

export const env = {
  ...raw,
  isDevelopment: raw.NODE_ENV === 'development',
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  trustProxy: raw.TRUST_PROXY === 'true',
  corsOrigins,
} as const;

export type Env = typeof env;

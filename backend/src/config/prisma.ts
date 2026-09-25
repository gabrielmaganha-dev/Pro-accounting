import { PrismaClient } from '@prisma/client';

import { env } from './env.js';

/**
 * Instância única do Prisma Client.
 *
 * Em desenvolvimento o `tsx watch` reinicia o módulo a cada alteração de
 * arquivo. Sem guardar a instância no escopo global, cada reinício abriria um
 * novo pool de conexões e o PostgreSQL rejeitaria novos clientes depois de
 * algumas dezenas de salvamentos ("too many connections").
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Explícito em vez de deixar o Prisma ler `env("DATABASE_URL")` do schema:
    // assim vale o fallback de src/config/env.ts (POSTGRES_PRISMA_URL na Vercel).
    datasourceUrl: env.DATABASE_URL,
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (env.isDevelopment) {
  globalForPrisma.prisma = prisma;
}

/** Falha cedo e com mensagem clara se o banco não estiver acessível. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/** Usado pelo health check para provar que a conexão está viva de verdade. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

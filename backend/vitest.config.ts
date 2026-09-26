import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Configuração dos testes do backend.
 *
 * Os testes rodam contra um PostgreSQL DE VERDADE — as consultas do painel e
 * do financeiro são SQL cru, e um banco simulado não provaria nada sobre elas.
 * Mas NUNCA contra o banco de desenvolvimento: cada teste apaga as tabelas.
 *
 * Por isso a URL de teste é derivada da DATABASE_URL de backend/.env trocando
 * apenas o nome do banco para `<nome>_test`. Quem quiser apontar para outro
 * servidor define TEST_DATABASE_URL. Em qualquer caso, `tests/setup/global.ts`
 * se recusa a rodar se o nome do banco não terminar em `_test`.
 */
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  let devUrl = process.env.DATABASE_URL;

  if (!devUrl) {
    try {
      const envFile = readFileSync(fileURLToPath(new URL('./.env', import.meta.url)), 'utf8');
      devUrl = parse(envFile).DATABASE_URL;
    } catch {
      // Sem .env: a mensagem abaixo explica o que fazer.
    }
  }

  if (!devUrl) {
    throw new Error(
      'Defina TEST_DATABASE_URL ou DATABASE_URL (backend/.env) para rodar os testes.',
    );
  }

  const url = new URL(devUrl);
  const database = url.pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) url.pathname = `/${database}_test`;

  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();

// O globalSetup roda no processo principal, onde `test.env` ainda não vale.
process.env.PRO_ACCOUNTING_TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global.ts'],
    setupFiles: ['tests/setup/per-file.ts'],

    // Um arquivo por vez: todos compartilham o mesmo banco, e dois arquivos
    // truncando tabelas em paralelo apagariam os dados um do outro.
    fileParallelism: false,

    // bcrypt + banco real: o padrão de 5s é apertado numa máquina carregada.
    testTimeout: 20_000,
    hookTimeout: 60_000,

    // Aplicadas antes de qualquer import. O `dotenv/config` de env.ts não
    // sobrescreve variáveis já definidas, então estas prevalecem sobre .env.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'segredo-exclusivo-dos-testes-automatizados-0123456789',
      JWT_EXPIRES_IN: '1h',
      // O mínimo aceito — o custo alto só atrasaria a suíte, sem testar nada.
      BCRYPT_SALT_ROUNDS: '10',
      CORS_ORIGIN: 'http://localhost:5173',
      TZ: 'America/Sao_Paulo',
    },
  },
});

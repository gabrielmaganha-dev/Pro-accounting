import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Roda uma vez antes da suíte: aplica as migrações no banco de teste.
 *
 * `migrate deploy` (e não `migrate dev`) porque é o que roda em produção —
 * se uma migração quebrar aqui, quebraria lá também.
 */
export default function globalSetup(): void {
  const databaseUrl = process.env.PRO_ACCOUNTING_TEST_DATABASE_URL ?? '';
  const database = new URL(databaseUrl).pathname.replace(/^\//, '');

  // Trava de segurança: os testes truncam todas as tabelas.
  if (!database.endsWith('_test')) {
    throw new Error(
      `Recusando rodar os testes no banco "${database}": o nome precisa terminar em "_test".`,
    );
  }

  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

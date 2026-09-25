/**
 * Build executado pela Vercel (buildCommand em vercel.json).
 *
 *   1. confere as variáveis sem as quais a API não sobe;
 *   2. compila o backend (prisma generate + tsc) — api/index.js importa de backend/dist;
 *   3. aplica as migrations pendentes (`prisma migrate deploy` nunca apaga dados);
 *   4. cria o administrador, se ADMIN_EMAIL e ADMIN_PASSWORD estiverem definidos
 *      (idempotente e nunca sobrescreve a senha — ver backend/src/database/seed.ts);
 *   5. compila o frontend apontando para /api, no mesmo domínio.
 *
 * Localmente continue usando `npm run build`; este script é só para a Vercel.
 */
import { execSync } from 'node:child_process';

// A integração Vercel + Supabase injeta POSTGRES_*; DATABASE_URL/DIRECT_URL
// definidas à mão têm prioridade.
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;

// Migrations precisam de conexão direta ou do pooler em modo sessão: o modo
// transação (porta 6543) não suporta o advisory lock que o Prisma usa.
const migrationUrl = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || databaseUrl;

const missing = [];
if (!databaseUrl) missing.push('DATABASE_URL (ou conecte o Supabase em Storage na Vercel)');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  missing.push('JWT_SECRET (mínimo de 32 caracteres — gere com: openssl rand -base64 48)');
}

if (missing.length > 0) {
  console.error(
    [
      '',
      '  Build cancelado: variáveis de ambiente faltando na Vercel.',
      '',
      ...missing.map((name) => `   • ${name}`),
      '',
      '  Defina em Project Settings → Environment Variables e faça o redeploy.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

function run(command, env = {}) {
  console.info(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

run('npm run build --prefix backend');
run('npm run db:deploy --prefix backend', { DATABASE_URL: migrationUrl });

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  run('npm run db:seed --prefix backend', { DATABASE_URL: migrationUrl });
} else {
  console.info('\nADMIN_EMAIL/ADMIN_PASSWORD não definidos — seed do administrador ignorado.');
}

run('npm run build --prefix frontend', {
  VITE_API_URL: process.env.VITE_API_URL || '/api',
});

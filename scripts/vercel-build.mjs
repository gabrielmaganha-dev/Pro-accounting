/**
 * Build executado pela Vercel (buildCommand em vercel.json).
 *
 *   1. confere as variáveis sem as quais a API não sobe;
 *   2. compila o backend (prisma generate + tsc) — api/index.js importa de backend/dist —
 *      e confere a configuração de produção com a mesma validação da API;
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
const databaseUrl =
  process.env.STORAGE_POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.STORAGE_POSTGRES_URL;

const migrationUrl =
  process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.STORAGE_POSTGRES_URL ||
  databaseUrl;

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

// A API confere a configuração ao subir e se recusa a rodar com o segredo de
// exemplo ou com uma origem malformada (backend/src/config/env.ts). A mesma
// conferência roda AQUI, antes das migrations: se algo estiver errado, o build
// falha com a explicação no log e a versão que já está no ar continua
// atendendo — em vez de o deploy ir ao ar com toda chamada à API dando erro.
run(`node -e "import('./backend/dist/config/env.js')"`, { NODE_ENV: 'production' });

run('npm run db:deploy --prefix backend', { DATABASE_URL: migrationUrl });

// Senhas que aparecem como exemplo no repositório (mesma lista do seed):
// qualquer pessoa as conhece. Com uma delas o seed é PULADO, com aviso — o
// build segue, porque o administrador que já existe não depende dele.
const PUBLIC_EXAMPLE_PASSWORDS = ['Admin@123456', 'UmaSenhaForte@123', 'UmaSenhaForte@2026'];
const adminPassword = process.env.ADMIN_PASSWORD;
const isPublicPassword =
  adminPassword !== undefined &&
  (PUBLIC_EXAMPLE_PASSWORDS.includes(adminPassword) || /troque/i.test(adminPassword));

if (process.env.ADMIN_EMAIL && adminPassword && !isPublicPassword) {
  // NODE_ENV=production: um administrador criado aqui sai com a troca de
  // senha obrigatória no primeiro login.
  run('npm run db:seed --prefix backend', { DATABASE_URL: migrationUrl, NODE_ENV: 'production' });
} else if (isPublicPassword) {
  console.warn(
    '\n  ADMIN_PASSWORD é uma senha de exemplo publicada no repositório — seed do ' +
      'administrador ignorado. Apague a variável na Vercel (o administrador já existe) ' +
      'ou defina uma senha só sua.',
  );
} else {
  console.info('\nADMIN_EMAIL/ADMIN_PASSWORD não definidos — seed do administrador ignorado.');
}

// Login com Google: a interface precisa do endereço do projeto Supabase e da
// chave PÚBLICA dele (anon/publishable) — as duas feitas para ir ao navegador.
// A integração da Vercel com o Supabase já as injeta, com os nomes dela; aqui
// elas ganham o nome que o Vite entende. Nada secreto (service role, JWT
// secret) é lido. Sem elas, o botão do Google simplesmente não aparece.
const pick = (...names) => names.map((name) => process.env[name]).find((value) => value);

const supabaseUrl = pick(
  'VITE_SUPABASE_URL',
  'STORAGE_NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'STORAGE_SUPABASE_URL',
  'SUPABASE_URL',
);
const supabaseAnonKey = pick(
  'VITE_SUPABASE_ANON_KEY',
  'STORAGE_NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'STORAGE_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'STORAGE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'STORAGE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
);

console.info(
  supabaseUrl && supabaseAnonKey
    ? '\nLogin com Google: endereço e chave pública do Supabase encontrados.'
    : '\nLogin com Google: variáveis do Supabase não encontradas — botão desligado.',
);

run('npm run build --prefix frontend', {
  VITE_API_URL: process.env.VITE_API_URL || '/api',
  ...(supabaseUrl && supabaseAnonKey
    ? { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: supabaseAnonKey }
    : {}),
});

import { UserRole, UserStatus } from '@prisma/client';

import { env } from '../config/env.js';
import { disconnectDatabase, prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/password.js';

/**
 * Seed do administrador inicial.
 *
 * Executado por `npm run db:seed` (que chama `prisma db seed`, configurado no
 * package.json para rodar este arquivo com tsx).
 *
 * Propriedades importantes:
 *
 *  • Idempotente — pode rodar quantas vezes quiser sem duplicar o usuário.
 *  • Não destrutivo — se o admin já existir, a SENHA NÃO é sobrescrita. Sem
 *    isto, um `db:seed` acidental depois de meses reverteria a senha do
 *    administrador para o valor do .env, que muita gente deixa no padrão.
 *  • A senha em texto puro nunca é gravada nem registrada em log.
 */
/** Senhas que aparecem como exemplo no repositório: qualquer pessoa as conhece. */
const PUBLIC_EXAMPLE_PASSWORDS = ['Admin@123456', 'UmaSenhaForte@123', 'UmaSenhaForte@2026'];

function isPublicExamplePassword(password: string): boolean {
  return PUBLIC_EXAMPLE_PASSWORDS.includes(password) || /troque/i.test(password);
}

async function main(): Promise<void> {
  const name = env.ADMIN_NAME ?? 'Administrador';
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      [
        '',
        '  Seed cancelado: faltam variáveis de ambiente.',
        '',
        '   Defina em backend/.env:',
        '     ADMIN_NAME="Administrador"',
        '     ADMIN_EMAIL=admin@proaccounting.com.br',
        '     ADMIN_PASSWORD=<uma senha só sua>',
        '',
        '   (ADMIN_PASSWORD precisa ter no mínimo 8 caracteres.)',
        '',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  /**
   * Em produção, as senhas de exemplo são recusadas.
   *
   * Elas estão — ou já estiveram — escritas no `.env.example` e no README,
   * publicados no repositório e guardados no histórico do Git. Criar o
   * administrador de um sistema real com uma delas é deixar a porta aberta
   * com a chave na fechadura — e é exatamente o que acontece quando alguém
   * copia o exemplo e esquece de editar esta linha.
   */
  if (env.isProduction && isPublicExamplePassword(password)) {
    console.error(
      [
        '',
        '  Seed cancelado: ADMIN_PASSWORD é uma senha de exemplo, publicada no repositório.',
        '',
        '   Defina uma senha própria antes de criar o administrador de produção.',
        '',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existing) {
    // Reconcilia apenas o que é seguro reconciliar. Senha fica intocada.
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });

    console.info('');
    console.info('  Administrador já existia — nome/perfil reconciliados.');
    console.info(`   E-mail: ${normalizedEmail}`);
    console.info('   A senha NÃO foi alterada.');
    // `db:reset` é comando de desenvolvimento: não existe na imagem de
    // produção, e lá ninguém deve ser convidado a apagar o banco.
    if (!env.isProduction) {
      console.info('   Para recriar do zero (APAGA TODOS OS DADOS): npm run db:reset');
    }
    console.info('');
    return;
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      password: passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      /**
       * Em produção a senha do seed é provisória: o primeiro login abre o
       * diálogo de troca obrigatória, o mesmo usado no reset de acesso.
       *
       * A senha inicial passou por um arquivo de configuração — foi digitada,
       * talvez copiada, e fica no `.env` do servidor. A definitiva só existe na
       * cabeça de quem a escolheu. Em desenvolvimento isso seria só atrito.
       */
      mustChangePassword: env.isProduction,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  console.info('');
  console.info('  Administrador criado com sucesso.');
  console.info(`   Nome:   ${admin.name}`);
  console.info(`   E-mail: ${admin.email}`);
  console.info(`   Perfil: ${admin.role}`);
  console.info('   Senha:  a definida em ADMIN_PASSWORD');
  console.info('');
  console.info(
    env.isProduction
      ? '   O sistema vai exigir a troca desta senha no primeiro login.'
      : '   Troque esta senha no primeiro login em ambiente real.',
  );
  console.info('');
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error('  Falha ao executar o seed:');
    console.error(error);
    console.error('');
    console.error('   Causas mais comuns:');
    console.error('     • o container do PostgreSQL não está no ar (docker compose up -d)');
    console.error('     • DATABASE_URL incorreta em backend/.env');
    console.error('     • as migrations ainda não rodaram (npm run db:migrate)');
    console.error('');
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDatabase();
  });

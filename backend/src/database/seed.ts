import { UserRole } from '@prisma/client';

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
        '     ADMIN_PASSWORD=UmaSenhaForte@123',
        '',
        '   (ADMIN_PASSWORD precisa ter no mínimo 8 caracteres.)',
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
      data: { name, role: UserRole.ADMIN, active: true },
    });

    console.info('');
    console.info('  Administrador já existia — nome/perfil reconciliados.');
    console.info(`   E-mail: ${normalizedEmail}`);
    console.info('   A senha NÃO foi alterada.');
    console.info('   Para recriar do zero (APAGA TODOS OS DADOS): npm run db:reset');
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
      active: true,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  console.info('');
  console.info('  Administrador criado com sucesso.');
  console.info(`   Nome:   ${admin.name}`);
  console.info(`   E-mail: ${admin.email}`);
  console.info(`   Perfil: ${admin.role}`);
  console.info('   Senha:  a definida em ADMIN_PASSWORD (backend/.env)');
  console.info('');
  console.info('   Troque esta senha no primeiro login em ambiente real.');
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

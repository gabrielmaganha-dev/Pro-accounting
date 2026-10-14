import { afterAll, beforeEach } from 'vitest';

import { prisma } from '../../src/config/prisma.js';

/**
 * Cada teste começa com o banco vazio.
 *
 * Isolamento total custa alguns milissegundos por teste, mas elimina a classe
 * de falha mais cara de depurar numa suíte: o teste que passa sozinho e falha
 * quando roda depois de outro que deixou dados para trás.
 */
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE payments, invoice_history, invoices, contracts, client_history, clients, users CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

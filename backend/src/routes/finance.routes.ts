import type { FastifyInstance } from 'fastify';

import {
  financeEntriesController,
  financeExportController,
  financeOverviewController,
} from '../controllers/finance.controller.js';

/**
 * Rotas do módulo financeiro — **exclusivas do administrador**.
 *
 * É a única área do sistema restrita por completo, e a diferença em relação
 * aos outros módulos é o RECORTE, não o dado em si. O funcionário já vê o
 * financeiro de um cliente na ficha dele e o de um contrato na ficha do
 * contrato — informação de que precisa para atender. O que ele não vê é o
 * consolidado do escritório: faturamento total, receita do ano, inadimplência
 * agregada. Isso é informação de gestão, e sai daqui pronta para uma planilha.
 *
 * A proteção que vale é esta. O item some do menu e o guard de rota barra a
 * navegação, mas os dois rodam no navegador do usuário — quem chamar a API
 * direto passa por cima deles. `authorize('ADMIN')` é o que não dá para burlar.
 */
export async function financeRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/finance/overview',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    financeOverviewController,
  );

  app.get(
    '/finance/entries',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    financeEntriesController,
  );

  app.get(
    '/finance/export',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    financeExportController,
  );
}

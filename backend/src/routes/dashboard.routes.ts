import type { FastifyInstance } from 'fastify';

import { dashboardController } from '../controllers/dashboard.controller.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/dashboard — exige usuário autenticado e ativo.
   *
   * Liberado para ADMIN e EMPLOYEE: a especificação dá ao funcionário
   * permissão de visualizar clientes, contratos e faturas, e o painel é
   * justamente a visão consolidada desses dados. Não há nada aqui que o
   * funcionário não possa ver nas telas de listagem.
   */
  app.get('/dashboard', { preHandler: [app.authenticate] }, dashboardController);
}

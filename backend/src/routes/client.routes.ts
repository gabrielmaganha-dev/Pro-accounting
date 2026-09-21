import type { FastifyInstance } from 'fastify';

import {
  createClientController,
  deleteClientController,
  getClientController,
  getClientHistoryController,
  listClientInvoicesController,
  listClientsController,
  updateClientController,
  updateClientStatusController,
} from '../controllers/client.controller.js';

/**
 * Rotas de clientes.
 *
 * MATRIZ DE PERMISSÃO — ADMIN faz tudo; o funcionário:
 *
 *   listar / ver / histórico .... SIM
 *   cadastrar ................... SIM
 *   editar ...................... PARCIAL (só dados de contato; a checagem
 *                                 campo a campo está no serviço, porque
 *                                 depende do CONTEÚDO do corpo e não apenas
 *                                 da rota)
 *   ativar / inativar ........... NÃO
 *   excluir ..................... NÃO
 *
 * Tirar um cliente de operação é decisão de gestão, não de atendimento: some
 * das listagens e afeta a cobrança. Por isso fica com o administrador.
 */
export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.get('/clients', { preHandler: [app.authenticate] }, listClientsController);

  app.get('/clients/:id', { preHandler: [app.authenticate] }, getClientController);

  app.get(
    '/clients/:id/history',
    { preHandler: [app.authenticate] },
    getClientHistoryController,
  );

  app.get(
    '/clients/:id/invoices',
    { preHandler: [app.authenticate] },
    listClientInvoicesController,
  );

  app.post('/clients', { preHandler: [app.authenticate] }, createClientController);

  app.put('/clients/:id', { preHandler: [app.authenticate] }, updateClientController);

  app.patch(
    '/clients/:id/status',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateClientStatusController,
  );

  app.delete(
    '/clients/:id',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    deleteClientController,
  );
}

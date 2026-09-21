import type { FastifyInstance } from 'fastify';

import {
  createContractController,
  deleteContractController,
  getContractController,
  listContractInvoicesController,
  listContractsController,
  nextContractNumberController,
  renewContractController,
  updateContractController,
  updateContractStatusController,
} from '../controllers/contract.controller.js';

/**
 * Rotas de contratos.
 *
 * MATRIZ DE PERMISSÃO — ADMIN faz tudo; o funcionário:
 *
 *   listar / ver / faturas ...... SIM
 *   cadastrar ................... SIM
 *   editar ...................... SIM, exceto a situação (a checagem está no
 *                                 serviço, porque depende do CONTEÚDO do corpo
 *                                 e não apenas da rota)
 *   encerrar / cancelar ......... NÃO
 *   renovar ..................... NÃO
 *   excluir ..................... NÃO
 *
 * O critério é o mesmo aplicado aos clientes: cadastrar e corrigir dados é
 * rotina de atendimento; mudar a vigência de um contrato é decisão de gestão,
 * porque altera o que será cobrado do cliente e por quanto tempo.
 */
export async function contractRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Antes de `/contracts/:id` de propósito.
   *
   * O roteador do Fastify prioriza segmento estático sobre parâmetro, então a
   * ordem não é estritamente necessária — mas deixá-la explícita evita que uma
   * futura troca de roteador transforme "next-number" num id de contrato.
   */
  app.get('/contracts/next-number', { preHandler: [app.authenticate] }, nextContractNumberController);

  app.get('/contracts', { preHandler: [app.authenticate] }, listContractsController);

  app.get('/contracts/:id', { preHandler: [app.authenticate] }, getContractController);

  app.get(
    '/contracts/:id/invoices',
    { preHandler: [app.authenticate] },
    listContractInvoicesController,
  );

  app.post('/contracts', { preHandler: [app.authenticate] }, createContractController);

  app.put('/contracts/:id', { preHandler: [app.authenticate] }, updateContractController);

  app.patch(
    '/contracts/:id/status',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateContractStatusController,
  );

  app.post(
    '/contracts/:id/renew',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    renewContractController,
  );

  app.delete(
    '/contracts/:id',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    deleteContractController,
  );
}

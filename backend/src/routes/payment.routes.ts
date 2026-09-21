import type { FastifyInstance } from 'fastify';

import {
  getPaymentController,
  listPaymentsController,
} from '../controllers/payment.controller.js';

/**
 * Rotas do histórico de pagamentos.
 *
 * Só leitura, e liberadas para os dois perfis: conferir o que entrou é tarefa
 * de atendimento tanto quanto de gestão.
 *
 * Um pagamento é CRIADO em `POST /invoices/:id/payment` e desfeito em
 * `DELETE /invoices/:id/payments/:paymentId`. Não existe criação avulsa aqui
 * de propósito: dinheiro sem fatura vinculada seria um lançamento que ninguém
 * consegue explicar depois.
 */
export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/payments', { preHandler: [app.authenticate] }, listPaymentsController);

  app.get('/payments/:id', { preHandler: [app.authenticate] }, getPaymentController);
}

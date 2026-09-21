import type { FastifyInstance } from 'fastify';

import {
  createInvoiceController,
  deleteInvoiceController,
  getInvoiceController,
  getInvoiceHistoryController,
  listInvoicePaymentsController,
  listInvoicesController,
  nextInvoiceNumberController,
  registerPaymentController,
  removePaymentController,
  updateInvoiceController,
  updateInvoiceStatusController,
} from '../controllers/invoice.controller.js';

/**
 * Rotas de faturas.
 *
 * MATRIZ DE PERMISSÃO — ADMIN faz tudo; o funcionário:
 *
 *   listar / ver / histórico / pagamentos ..... SIM
 *   emitir .................................... SIM
 *   editar .................................... SIM
 *   registrar pagamento ....................... SIM
 *   cancelar / reabrir ........................ NÃO
 *   estornar pagamento ........................ NÃO
 *   excluir ................................... NÃO
 *
 * O critério segue o dos outros módulos: lançar o dia a dia é atendimento;
 * desfazer o que já foi lançado é gestão. Registrar pagamento fica liberado
 * porque é a operação mais frequente do balcão — e ela só ACRESCENTA
 * informação, sempre com autor e data no histórico. Estornar, ao contrário,
 * apaga dinheiro do sistema, e por isso exige administrador.
 */
export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Antes de `/invoices/:id` de propósito.
   *
   * O roteador do Fastify prioriza segmento estático sobre parâmetro, então a
   * ordem não é estritamente necessária — mas deixá-la explícita evita que uma
   * futura troca de roteador transforme "next-number" num id de fatura.
   */
  app.get('/invoices/next-number', { preHandler: [app.authenticate] }, nextInvoiceNumberController);

  app.get('/invoices', { preHandler: [app.authenticate] }, listInvoicesController);

  app.get('/invoices/:id', { preHandler: [app.authenticate] }, getInvoiceController);

  app.get('/invoices/:id/history', { preHandler: [app.authenticate] }, getInvoiceHistoryController);

  app.get(
    '/invoices/:id/payments',
    { preHandler: [app.authenticate] },
    listInvoicePaymentsController,
  );

  app.post('/invoices', { preHandler: [app.authenticate] }, createInvoiceController);

  app.put('/invoices/:id', { preHandler: [app.authenticate] }, updateInvoiceController);

  /**
   * Registro de pagamento — atende nos dois caminhos.
   *
   * `/payment` no singular é a rota especificada para a ação; `/payments` no
   * plural é a coleção que o `GET` já usa, e mantê-la aceitando `POST` segue a
   * convenção REST do resto da API. As duas chamam o mesmo handler, então não
   * há comportamento divergente a manter em sincronia.
   */
  app.post(
    '/invoices/:id/payment',
    { preHandler: [app.authenticate] },
    registerPaymentController,
  );

  app.post(
    '/invoices/:id/payments',
    { preHandler: [app.authenticate] },
    registerPaymentController,
  );

  app.patch(
    '/invoices/:id/status',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateInvoiceStatusController,
  );

  app.delete(
    '/invoices/:id/payments/:paymentId',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    removePaymentController,
  );

  app.delete(
    '/invoices/:id',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    deleteInvoiceController,
  );
}

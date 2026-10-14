import type { FastifyInstance } from 'fastify';

import {
  exportReportController,
  listReportsController,
  runReportController,
} from '../controllers/report.controller.js';

/**
 * Rotas de relatórios — TRÊS rotas para os quinze relatórios.
 *
 *   GET /reports              catálogo, filtrado pelo perfil
 *   GET /reports/:id          dados, paginados
 *   GET /reports/:id/export   arquivo em csv, xlsx ou pdf
 *
 * Todas exigem autenticação; nenhuma exige ADMIN no `preHandler`. A restrição
 * dos relatórios financeiros é aplicada no SERVIÇO, e essa diferença em relação
 * ao módulo financeiro é deliberada: como a rota é uma só, ela não sabe se o
 * `:id` que chegou é restrito — só o catálogo sabe. Pôr `authorize('ADMIN')`
 * aqui trancaria os relatórios de clientes e contratos junto, que o funcionário
 * precisa acessar.
 *
 * O efeito para quem tenta burlar é o mesmo: chamar
 * `/api/reports/finance-overdue` com token de funcionário devolve 403 antes de
 * qualquer consulta ao banco.
 */
export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports', { preHandler: [app.authenticate] }, listReportsController);

  app.get('/reports/:id', { preHandler: [app.authenticate] }, runReportController);

  app.get(
    '/reports/:id/export',
    { preHandler: [app.authenticate] },
    exportReportController,
  );
}

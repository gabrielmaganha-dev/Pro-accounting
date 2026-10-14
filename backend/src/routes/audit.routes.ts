import type { FastifyInstance } from 'fastify';

import { listAuditLogsController } from '../controllers/audit.controller.js';

/**
 * Rotas de auditoria — leitura, e só para administrador.
 *
 * NÃO EXISTE rota de escrita, edição ou exclusão, e a ausência é o ponto: a
 * trilha é preenchida pelos próprios serviços de negócio, no momento em que a
 * ação acontece. Expor um `POST /audit-logs` permitiria forjar linhas, e um
 * `DELETE` permitiria apagar as próprias — as duas coisas que uma trilha de
 * auditoria existe para impedir.
 *
 * Restrita ao administrador porque a trilha mostra o que TODOS fizeram,
 * incluindo IP e navegador. É informação de supervisão, não de rotina.
 */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/audit-logs',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    listAuditLogsController,
  );
}

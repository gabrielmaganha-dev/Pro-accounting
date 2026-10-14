import type { FastifyInstance } from 'fastify';

import {
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from '../controllers/notification.controller.js';

/**
 * Rotas de notificações.
 *
 * Sem `authorize`: toda notificação já é filtrada pelo usuário da sessão, então
 * não há o que restringir por perfil — cada um só alcança a própria caixa.
 * Os dois perfis recebem os mesmos alertas, porque tanto o atendimento quanto a
 * gestão precisam saber de fatura atrasada e contrato vencendo.
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', { preHandler: [app.authenticate] }, listNotificationsController);

  /**
   * Antes de `/notifications/:id/read` por clareza.
   *
   * Não há ambiguidade real — os caminhos têm profundidades diferentes
   * (`/read-all` tem dois segmentos, `/:id/read` tem três) — mas a ordem
   * explícita evita que uma futura troca de roteador transforme "read-all" num
   * id de notificação.
   */
  app.patch(
    '/notifications/read-all',
    { preHandler: [app.authenticate] },
    markAllNotificationsReadController,
  );

  app.patch(
    '/notifications/:id/read',
    { preHandler: [app.authenticate] },
    markNotificationReadController,
  );
}

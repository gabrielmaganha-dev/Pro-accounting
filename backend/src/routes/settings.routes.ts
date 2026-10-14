import type { FastifyInstance } from 'fastify';

import {
  getSettingsController,
  updateAppearanceController,
  updateCompanyController,
  updateGeneralController,
} from '../controllers/settings.controller.js';

/**
 * Rotas de configuração.
 *
 *   LER ....... qualquer usuário autenticado — a interface precisa da marca,
 *               das cores e do formato de data para se desenhar.
 *   ALTERAR ... somente ADMIN, nas três rotas de escrita.
 *
 * Diferente do módulo de relatórios, aqui o `authorize('ADMIN')` pode ficar no
 * `preHandler`: cada rota de escrita tem um escopo fixo e conhecido, então a
 * própria rota já sabe o que está sendo alterado.
 */
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', { preHandler: [app.authenticate] }, getSettingsController);

  app.put(
    '/settings/company',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateCompanyController,
  );

  app.put(
    '/settings/appearance',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateAppearanceController,
  );

  app.put(
    '/settings/general',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateGeneralController,
  );
}

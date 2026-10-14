import type { FastifyInstance } from 'fastify';

import {
  loginController,
  logoutController,
  meController,
} from '../controllers/auth.controller.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/login — pública.
   *
   * Limite mais rígido que o global: força bruta contra senha é a ameaça mais
   * previsível de um painel administrativo exposto na internet. 10 tentativas
   * por minuto por IP não atrapalha um humano e inviabiliza um script.
   */
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    loginController,
  );

  /**
   * GET /api/auth/me — exige token válido de usuário ativo.
   *
   * Para restringir uma rota a um perfil, encadeie o segundo guard:
   *   { preHandler: [app.authenticate, app.authorize('ADMIN')] }
   * A ordem importa: `authorize` depende do `currentUser` que `authenticate`
   * coloca na requisição.
   */
  app.get('/auth/me', { preHandler: [app.authenticate] }, meController);

  /**
   * POST /api/auth/logout — registra a saída na trilha de auditoria.
   *
   * Exige token porque só faz sentido encerrar uma sessão que existe, e é o
   * token que diz de quem ela é.
   */
  app.post('/auth/logout', { preHandler: [app.authenticate] }, logoutController);
}

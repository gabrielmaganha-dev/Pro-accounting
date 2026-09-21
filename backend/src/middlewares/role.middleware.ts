import type { UserRole } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../utils/app-error.js';

/**
 * Autorização por perfil.
 *
 * Fábrica de preHandler: `roleMiddleware('ADMIN')` devolve o guard que só
 * deixa administradores passarem.
 *
 * Deve ser sempre encadeado DEPOIS de `authMiddleware` — é ele quem preenche
 * `request.currentUser`. Se a ordem for invertida, o guard abaixo devolve 401
 * em vez de falhar silenciosamente aberto.
 *
 * Uso na rota:
 *   { preHandler: [app.authenticate, app.authorize('ADMIN')] }
 */
export function roleMiddleware(...allowedRoles: UserRole[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = request.currentUser;

    if (!user) {
      throw AppError.unauthorized('Autenticação necessária.');
    }

    if (!allowedRoles.includes(user.role)) {
      throw AppError.forbidden('Você não tem permissão para acessar este recurso.');
    }
  };
}

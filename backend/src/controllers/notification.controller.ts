import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  listNotifications,
  markAllAsRead,
  markAsRead,
} from '../services/notification.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from '../validators/notification.validator.js';

/**
 * Lê o usuário da requisição.
 *
 * Aqui não é só formalidade como nas outras rotas: as notificações são
 * PESSOAIS, e o id da sessão é o único recorte que existe. Nenhuma rota deste
 * módulo aceita um userId vindo do cliente — se aceitasse, qualquer usuário
 * leria a caixa de outro.
 */
function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/** GET /api/notifications */
export async function listNotificationsController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const query = validate(listNotificationsQuerySchema, request.query);

  const result = await listNotifications(user.id, query);

  return reply.status(200).send(ok(result));
}

/** PATCH /api/notifications/:id/read */
export async function markNotificationReadController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = requireUser(request);
  const { id } = validate(notificationIdParamSchema, request.params);

  const notification = await markAsRead(user.id, id);

  return reply.status(200).send(ok(notification));
}

/** PATCH /api/notifications/read-all */
export async function markAllNotificationsReadController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = requireUser(request);

  const result = await markAllAsRead(user.id);

  return reply.status(200).send(ok(result));
}

import type { FastifyReply, FastifyRequest } from 'fastify';

import { login } from '../services/auth.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import { loginSchema } from '../validators/auth.validator.js';

/**
 * POST /api/auth/login
 *
 * Os controllers ficam finos de propósito: validam a entrada, chamam o
 * serviço e formatam a saída. Regra de negócio mora em `services/`.
 */
export async function loginController(request: FastifyRequest, reply: FastifyReply) {
  const credentials = validate(loginSchema, request.body);

  const result = await login(request.server, credentials);

  return reply.status(200).send(ok(result));
}

/**
 * GET /api/auth/me
 *
 * Usada pelo frontend ao recarregar a página: confirma que o token guardado
 * ainda é válido e devolve os dados atuais do usuário. É também a prova de
 * que o `authMiddleware` está funcionando.
 */
export async function meController(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;

  if (!user) {
    // Inalcançável enquanto a rota estiver protegida — mas se alguém remover o
    // preHandler, o erro é explícito em vez de um `undefined` vazando.
    throw AppError.unauthorized();
  }

  return reply.status(200).send(ok({ user }));
}

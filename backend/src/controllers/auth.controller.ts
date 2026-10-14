import type { FastifyReply, FastifyRequest } from 'fastify';

import { requestOrigin } from '../middlewares/auth.middleware.js';
import { recordAudit } from '../services/audit.service.js';
import { login } from '../services/auth.service.js';
import { ok } from '../utils/api-response.js';
import { AppError, isAppError } from '../utils/app-error.js';
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
  const origin = requestOrigin(request);

  try {
    const result = await login(request.server, credentials);

    await recordAudit(
      { ...result.user, ...origin },
      { action: 'LOGIN', entity: 'SESSION', entityId: result.user.id, entityLabel: result.user.email },
    );

    return reply.status(200).send(ok(result));
  } catch (error) {
    /**
     * Toda recusa vira uma linha na trilha.
     *
     * É o que permite enxergar uma sequência de tentativas contra a mesma conta
     * ou vindas do mesmo IP — o sinal de força bruta. Sem isto, o sistema
     * responderia "e-mail ou senha incorretos" milhares de vezes e ninguém
     * jamais saberia.
     *
     * O MOTIVO vai no metadata, não na resposta: para o cliente HTTP a
     * mensagem continua sendo a mesma para e-mail inexistente e senha errada,
     * senão o login vira um verificador de quais e-mails estão cadastrados.
     */
    if (isAppError(error)) {
      await recordAudit(
        { email: credentials.email, ...origin },
        {
          action: 'LOGIN_FAILED',
          entity: 'SESSION',
          entityLabel: credentials.email,
          metadata: { motivo: error.statusCode === 403 ? 'conta desativada' : 'credenciais inválidas' },
        },
      );
    }

    throw error;
  }
}

/**
 * POST /api/auth/logout
 *
 * O token é sem estado: quem encerra a sessão de fato é o navegador, apagando
 * o que guardou. Esta rota existe para REGISTRAR o encerramento na trilha —
 * sem ela, a auditoria mostraria entradas e nenhuma saída, e ninguém saberia
 * se uma sessão foi fechada ou apenas abandonada.
 *
 * Responde 204 mesmo se algo falhar do lado do servidor: não existe cenário em
 * que valha impedir alguém de sair.
 */
export async function logoutController(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;

  if (user) {
    await recordAudit(user, {
      action: 'LOGOUT',
      entity: 'SESSION',
      entityId: user.id,
      entityLabel: user.email,
    });
  }

  return reply.status(204).send();
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

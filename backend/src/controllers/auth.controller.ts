import type { FastifyReply, FastifyRequest } from 'fastify';

import { requestOrigin } from '../middlewares/auth.middleware.js';
import { recordAudit } from '../services/audit.service.js';
import {
  assertCanSignIn,
  issueSession,
  login,
  resolveGoogleAccount,
} from '../services/auth.service.js';
import { verifyGoogleSession } from '../services/google-identity.service.js';
import { ok } from '../utils/api-response.js';
import { AppError, isAppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import { googleLoginSchema, loginSchema } from '../validators/auth.validator.js';

/** Motivo legível de uma recusa de login, para a trilha de auditoria. */
function refusalReason(error: AppError): string {
  if (error.code === 'ACCOUNT_PENDING') return 'aguardando aprovação';
  if (error.code === 'ACCOUNT_BLOCKED') return 'conta bloqueada';
  return 'credenciais inválidas';
}

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
          metadata: { motivo: refusalReason(error) },
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
/**
 * Login com Google.
 *
 * 1. confirma no servidor do Supabase a quem pertence o token (nada do que o
 *    navegador diz é aceito por si só);
 * 2. encontra, vincula ou cria a conta do sistema;
 * 3. só emite a sessão se a conta estiver ATIVA.
 *
 * O primeiro acesso de alguém novo termina no passo 3 com "aguardando
 * aprovação" — de propósito: a conta existe, mas só entra depois que um
 * administrador a aprovar.
 */
export async function googleLoginController(request: FastifyRequest, reply: FastifyReply) {
  const { accessToken } = validate(googleLoginSchema, request.body);
  const origin = requestOrigin(request);

  const identity = await verifyGoogleSession(accessToken);
  const { user, created, linked } = await resolveGoogleAccount(identity);
  const { status, ...sessionUser } = user;

  if (created) {
    await recordAudit(
      { ...sessionUser, ...origin },
      {
        action: 'CREATE',
        entity: 'USER',
        entityId: user.id,
        entityLabel: user.email,
        metadata: { origem: 'Conta Google', situacao: 'aguardando aprovação' },
      },
    );
  }

  if (linked) {
    await recordAudit(
      { ...sessionUser, ...origin },
      {
        action: 'UPDATE',
        entity: 'USER',
        entityId: user.id,
        entityLabel: user.email,
        metadata: { alteracao: 'Conta Google vinculada ao cadastro existente' },
      },
    );
  }

  try {
    assertCanSignIn(status);
  } catch (error) {
    if (isAppError(error)) {
      await recordAudit(
        { email: user.email, ...origin },
        {
          action: 'LOGIN_FAILED',
          entity: 'SESSION',
          entityLabel: user.email,
          metadata: { metodo: 'Google', motivo: refusalReason(error) },
        },
      );

      // Primeiro acesso: a mensagem confirma que o cadastro foi recebido.
      if (created && error.code === 'ACCOUNT_PENDING') {
        throw AppError.accountPending(
          'Cadastro recebido! Seu acesso está aguardando aprovação do administrador.',
        );
      }
    }

    throw error;
  }

  const result = issueSession(request.server, sessionUser);

  await recordAudit(
    { ...result.user, ...origin },
    {
      action: 'LOGIN',
      entity: 'SESSION',
      entityId: result.user.id,
      entityLabel: result.user.email,
      metadata: { metodo: 'Google' },
    },
  );

  return reply.status(200).send(ok(result));
}

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

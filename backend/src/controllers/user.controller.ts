import type { FastifyReply, FastifyRequest } from 'fastify';

import { issueSession } from '../services/auth.service.js';
import {
  changeOwnPassword,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  resetUserPassword,
  setUserRole,
  setUserStatus,
  updateOwnProfile,
  updateUser,
} from '../services/user.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  changePasswordSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  updateOwnProfileSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from '../validators/user.validator.js';

/** Lê o usuário da requisição. Inalcançável em rota protegida, mas explícito. */
function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/** GET /api/users */
export async function listUsersController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(listUsersQuerySchema, request.query);
  const result = await listUsers(query);

  return reply.status(200).send(ok(result));
}

/** GET /api/users/:id */
export async function getUserController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(userIdParamSchema, request.params);
  const user = await getUserById(id);

  return reply.status(200).send(ok(user));
}

/** POST /api/users */
export async function createUserController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const input = validate(createUserSchema, request.body);
  const user = await createUser(input);

  // A senha inicial NÃO entra no metadata. O sanitizador da auditoria a
  // removeria de qualquer forma, mas não mandá-la é a primeira barreira.
  await recordAudit(actor, {
    action: 'CREATE',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.email,
    metadata: { perfil: user.role, ativo: user.active },
  });

  return reply.status(201).send(ok(user));
}

/** PUT /api/users/:id */
export async function updateUserController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(userIdParamSchema, request.params);
  const input = validate(updateUserSchema, request.body);

  const user = await updateUser(id, input);

  await recordAudit(actor, {
    action: 'UPDATE',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.email,
    metadata: { camposEnviados: Object.keys(input) },
  });

  return reply.status(200).send(ok(user));
}

/** PATCH /api/users/:id/role */
export async function updateUserRoleController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(userIdParamSchema, request.params);
  const { role } = validate(updateUserRoleSchema, request.body);

  const user = await setUserRole(id, role, actor);

  // Ação própria na trilha: promover alguém a administrador é a mudança de
  // privilégio mais consequente do sistema e não pode aparecer misturada com
  // uma correção de nome sob o rótulo genérico de "alteração".
  await recordAudit(actor, {
    action: 'ROLE_CHANGED',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.email,
    metadata: { novoPerfil: user.role },
  });

  return reply.status(200).send(ok(user));
}

/** PATCH /api/users/:id/status */
export async function updateUserStatusController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(userIdParamSchema, request.params);
  const { active } = validate(updateUserStatusSchema, request.body);

  const user = await setUserStatus(id, active, actor);

  await recordAudit(actor, {
    action: user.active ? 'ACTIVATE' : 'DEACTIVATE',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.email,
  });

  return reply.status(200).send(ok(user));
}

/**
 * POST /api/users/:id/reset-password
 *
 * Único ponto do sistema em que uma senha em texto puro aparece numa resposta.
 * Ela é gerada agora, não é recuperável depois e não é registrada em log —
 * o corpo desta resposta é a única cópia legível que existirá.
 */
export async function resetUserPasswordController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(userIdParamSchema, request.params);

  const result = await resetUserPassword(id, actor);

  // A senha provisória fica FORA do metadata. Gravá-la na trilha — a tabela
  // feita para ser preservada e lida — anularia todo o cuidado de exibi-la uma
  // única vez e nunca persisti-la em texto puro.
  await recordAudit(actor, {
    action: 'PASSWORD_RESET',
    entity: 'USER',
    entityId: result.user.id,
    entityLabel: result.user.email,
    metadata: { sessoesEncerradas: true },
  });

  return reply.status(200).send(ok(result));
}

/**
 * POST /api/users/me/password
 *
 * Aberta a qualquer usuário autenticado: cada pessoa troca a própria senha,
 * ninguém troca a dos outros por aqui. A rota devolve um TOKEN NOVO porque a
 * troca carimba `passwordChangedAt`, e o token que veio nesta requisição passa
 * a ser anterior a esse carimbo — a próxima requisição com ele seria recusada.
 * Trocar o token aqui mantém quem trocou a senha dentro do sistema e derruba
 * todas as OUTRAS sessões da mesma conta, que é justamente o efeito desejado.
 */
export async function changeOwnPasswordController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const input = validate(changePasswordSchema, request.body);

  const user = await changeOwnPassword(actor, input);

  await recordAudit(actor, {
    action: 'PASSWORD_CHANGED',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.email,
    metadata: { proprioUsuario: true, outrasSessoesEncerradas: true },
  });

  const session = issueSession(request.server, {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });

  return reply.status(200).send(ok(session));
}

/**
 * PUT /api/users/me
 *
 * Cada pessoa edita o próprio cadastro. Não aceita `role` nem `active` — o
 * schema os recusa — para que esta rota não vire o caminho curto para alguém se
 * promover a administrador.
 */
export async function updateOwnProfileController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const input = validate(updateOwnProfileSchema, request.body);

  const user = await updateOwnProfile(actor, input);

  await recordAudit(actor, {
    action: 'UPDATE',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.email,
    metadata: {
      proprioUsuario: true,
      emailAlterado: user.email !== actor.email,
    },
  });

  return reply.status(200).send(ok(user));
}

/** DELETE /api/users/:id */
export async function deleteUserController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(userIdParamSchema, request.params);

  // Lido antes da exclusão: é justamente a conta de quem fez algo errado que
  // alguém tentaria apagar, e a trilha precisa dizer QUAL conta era.
  const alvo = await getUserById(id);

  await deleteUser(id, actor);

  await recordAudit(actor, {
    action: 'DELETE',
    entity: 'USER',
    entityId: id,
    entityLabel: alvo.email,
    metadata: { perfil: alvo.role },
  });

  return reply.status(204).send();
}

import type { FastifyInstance } from 'fastify';

import {
  changeOwnPasswordController,
  createUserController,
  deleteUserController,
  getUserController,
  listUsersController,
  resetUserPasswordController,
  updateOwnProfileController,
  updateUserController,
  updateUserRoleController,
  updateUserStatusController,
} from '../controllers/user.controller.js';

/**
 * Rotas de usuários.
 *
 * MATRIZ DE PERMISSÃO — este é o módulo mais restrito do sistema:
 *
 *   listar / ver ................ ADMIN
 *   criar ....................... ADMIN
 *   editar cadastro ............. ADMIN
 *   alterar perfil .............. ADMIN
 *   ativar / inativar ........... ADMIN
 *   resetar acesso .............. ADMIN
 *   excluir ..................... ADMIN
 *   trocar a PRÓPRIA senha ...... qualquer usuário autenticado
 *
 * A listagem também é de administrador, e isso é deliberado: ela expõe quem
 * tem perfil de administrador na empresa, que é a primeira informação útil
 * para quem quer escolher um alvo.
 *
 * O `app.authorize('ADMIN')` abaixo é a barreira REAL. O menu escondido e o
 * guard de rota no frontend são conveniência visual: quem chamar
 * `DELETE /api/users/<id>` com o token de um funcionário — via curl, Postman ou
 * console do navegador — bate aqui e recebe 403 antes de qualquer consulta ao
 * banco.
 *
 * ORDEM DAS ROTAS: `/users/me/password` é declarada antes de `/users/:id`.
 * Fastify casa rotas estáticas antes de paramétricas independentemente da
 * ordem de registro, mas a ordem explícita deixa a intenção legível para quem
 * vier acrescentar rotas depois.
 */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/users/me/password — troca da própria senha.
   *
   * Limite mais rígido que o global, pelo mesmo motivo do login: a rota
   * verifica a senha atual, então aceita palpites. Seis tentativas por minuto
   * não atrapalham quem errou a digitação e inviabilizam um script.
   */
  app.post(
    '/users/me/password',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    changeOwnPasswordController,
  );

  /**
   * PUT /api/users/me — edição do próprio cadastro.
   *
   * Declarada antes de `/users/:id` pelo mesmo motivo da rota de senha: o
   * Fastify casa rota estática antes de paramétrica, mas a ordem explícita
   * deixa a intenção legível para quem acrescentar rotas depois.
   */
  app.put('/users/me', { preHandler: [app.authenticate] }, updateOwnProfileController);

  app.get(
    '/users',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    listUsersController,
  );

  app.get(
    '/users/:id',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    getUserController,
  );

  app.post(
    '/users',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    createUserController,
  );

  app.put(
    '/users/:id',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateUserController,
  );

  app.patch(
    '/users/:id/role',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateUserRoleController,
  );

  app.patch(
    '/users/:id/status',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    updateUserStatusController,
  );

  app.post(
    '/users/:id/reset-password',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    resetUserPasswordController,
  );

  app.delete(
    '/users/:id',
    { preHandler: [app.authenticate, app.authorize('ADMIN')] },
    deleteUserController,
  );
}

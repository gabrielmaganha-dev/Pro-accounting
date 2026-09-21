import type { UserRole } from '@prisma/client';

import type { AuthenticatedUser, JwtPayload } from './auth.js';

// FastifyRequest e FastifyReply NÃO são importados aqui de propósito: dentro
// de `declare module 'fastify'` esses nomes já resolvem para as interfaces do
// próprio módulo. Importá-los deixaria os imports sem uso.

/**
 * Augmentação de tipos do Fastify.
 *
 * Sem isto, `request.currentUser` e `app.authenticate` seriam `any` — e o
 * TypeScript deixaria passar exatamente os erros que ele deveria pegar.
 */

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** O que `app.jwt.sign()` aceita. */
    payload: JwtPayload;
    /** O que `request.jwtVerify()` deposita em `request.user`. */
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Preenchido por `authMiddleware` após validar o token E confirmar que o
     * usuário ainda existe e está ativo. Indefinido em rotas públicas.
     */
    currentUser?: AuthenticatedUser;
  }

  interface FastifyInstance {
    /** preHandler que exige um JWT válido de um usuário ativo. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

    /** Fábrica de preHandler que exige um dos perfis informados. */
    authorize: (
      ...roles: UserRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

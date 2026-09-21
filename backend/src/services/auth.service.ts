import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser, JwtPayload } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { simulatePasswordVerification, verifyPassword } from '../utils/password.js';
import type { LoginInput } from '../validators/auth.validator.js';

export interface LoginResult {
  token: string;
  /** Validade do token, no mesmo formato configurado em JWT_EXPIRES_IN. */
  expiresIn: string;
  user: AuthenticatedUser;
}

/**
 * Mensagem única para e-mail inexistente E senha errada.
 *
 * Distinguir os dois casos ("e-mail não cadastrado" vs "senha incorreta")
 * transforma o login num verificador de quais e-mails existem no sistema.
 */
const INVALID_CREDENTIALS = 'E-mail ou senha incorretos.';

export async function login(app: FastifyInstance, input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      password: true,
    },
  });

  if (!user) {
    // Gasta o mesmo tempo que gastaria verificando uma senha real, para que o
    // tempo de resposta não revele se o e-mail existe.
    await simulatePasswordVerification(input.password);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  const passwordMatches = await verifyPassword(input.password, user.password);

  if (!passwordMatches) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  // A checagem de conta desativada vem DEPOIS da senha de propósito: se viesse
  // antes, qualquer pessoa descobriria contas desativadas sem saber a senha.
  if (!user.active) {
    throw AppError.forbidden('Seu acesso foi desativado. Procure um administrador.');
  }

  const payload: JwtPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  // A validade vem das opções de `sign` registradas em app.ts (JWT_EXPIRES_IN).
  const token = app.jwt.sign(payload);

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

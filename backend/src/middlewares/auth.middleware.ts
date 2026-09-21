import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/app-error.js';

/**
 * Exige um JWT válido e confirma o usuário no banco.
 *
 * A consulta ao banco é intencional. Validar só a assinatura do token deixaria
 * um usuário desativado (ou excluído) continuar usando o sistema até o token
 * expirar — até 24h de acesso indevido. O custo é uma consulta indexada por
 * chave primária por requisição, o que é irrelevante perto do risco.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    // Lê o header Authorization: Bearer <token>, verifica assinatura e
    // expiração, e popula request.user com o payload.
    await request.jwtVerify();
  } catch {
    // A causa real (expirado, malformado, assinatura inválida) fica no log;
    // para o cliente a mensagem é sempre a mesma, para não servir de oráculo.
    throw AppError.unauthorized('Sessão expirada ou inválida. Faça login novamente.');
  }

  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!user) {
    throw AppError.unauthorized('Sessão expirada ou inválida. Faça login novamente.');
  }

  if (!user.active) {
    throw AppError.forbidden('Seu acesso foi desativado. Procure um administrador.');
  }

  request.currentUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

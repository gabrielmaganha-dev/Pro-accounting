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
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      passwordChangedAt: true,
    },
  });

  if (!user) {
    throw AppError.unauthorized('Sessão expirada ou inválida. Faça login novamente.');
  }

  if (!user.active) {
    throw AppError.forbidden('Seu acesso foi desativado. Procure um administrador.');
  }

  if (isTokenOlderThanPassword(request.user.iat, user.passwordChangedAt)) {
    throw AppError.unauthorized('Sua senha foi alterada. Faça login novamente.');
  }

  request.currentUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    ...requestOrigin(request),
  };
}

/**
 * Origem da requisição, para a trilha de auditoria.
 *
 * `request.ip` já respeita o `trustProxy` configurado em app.ts — atrás de um
 * nginx ele devolve o IP real do cliente, e não o do proxy. Sem isso, toda
 * linha da auditoria registraria o mesmo endereço.
 *
 * O user-agent é truncado em 255 porque a coluna tem esse tamanho e porque
 * cliente nenhum precisa de mais que isso para ser identificado; o resto é
 * enfeite que alguns navegadores acrescentam.
 */
export function requestOrigin(request: FastifyRequest): { ip?: string; userAgent?: string } {
  const agent = request.headers['user-agent'];

  return {
    ...(request.ip ? { ip: request.ip } : {}),
    ...(typeof agent === 'string' && agent.length > 0
      ? { userAgent: agent.slice(0, 255) }
      : {}),
  };
}

/**
 * Revogação de tokens emitidos antes da última troca de senha.
 *
 * É o que dá efeito imediato ao "resetar acesso" e à desativação de conta.
 * Sem esta comparação, quem já estivesse logado continuaria dentro do sistema
 * por até 24h depois de ter o acesso cortado — e um reset feito justamente
 * porque a conta foi comprometida não tiraria o invasor de lá.
 *
 * TOLERÂNCIA DE UM SEGUNDO, e ela não é um detalhe: o claim `iat` tem
 * granularidade de SEGUNDOS, enquanto `passwordChangedAt` é gravado em
 * milissegundos. Um token emitido às 10:00:00.200 carrega iat = 10:00:00, e
 * seria recusado por um carimbo de 10:00:00.750 gravado no mesmo instante —
 * ou seja, a troca de senha invalidaria o token que ela acabou de emitir.
 * Truncar o carimbo para o segundo elimina essa corrida; a brecha que resta é
 * de menos de um segundo, sem valor prático para um atacante.
 */
function isTokenOlderThanPassword(issuedAt: number | undefined, changedAt: Date): boolean {
  // Token sem `iat` só aparece se alguém assinar fora do fluxo normal. Tratado
  // como suspeito: não dá para provar que é posterior à troca.
  if (typeof issuedAt !== 'number') return true;

  return issuedAt < Math.floor(changedAt.getTime() / 1000);
}

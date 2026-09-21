import type { UserRole } from '@prisma/client';

/**
 * Conteúdo assinado dentro do JWT.
 *
 * Só entra aqui o que é barato de carregar e não é sigiloso. O payload de um
 * JWT é apenas base64 — qualquer pessoa com o token consegue lê-lo. Senha,
 * hash e dados de cliente nunca vão para cá.
 */
export interface JwtPayload {
  /** Id do usuário (claim padrão `sub`). */
  sub: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Usuário já validado contra o banco na requisição atual.
 *
 * Diferente do `JwtPayload`: este reflete o estado atual do registro, não o
 * estado de quando o token foi emitido. É o que garante que um usuário
 * desativado perca o acesso imediatamente, sem esperar o token expirar.
 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

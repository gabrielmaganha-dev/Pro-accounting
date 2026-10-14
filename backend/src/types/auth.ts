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

  /**
   * Instante de emissão, em segundos (claim padrão `iat`).
   *
   * Preenchido pela biblioteca ao assinar, não por nós — por isso é opcional
   * do lado de quem monta o payload. É lido no middleware de autenticação para
   * recusar tokens anteriores à última troca de senha.
   */
  iat?: number;
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

  /**
   * Verdadeiro enquanto a senha em uso for a provisória gerada num reset de
   * acesso (ou a inicial, definida por um administrador no cadastro).
   *
   * Viaja em `AuthenticatedUser`, e não só no corpo do login, porque a
   * interface precisa reagir a ele também quando a sessão é restaurada via
   * `/auth/me` depois de um F5.
   */
  mustChangePassword: boolean;

  /**
   * Origem da requisição — preenchida pelo middleware de autenticação.
   *
   * Vive aqui, e não num parâmetro à parte, porque `AuthenticatedUser` já é o
   * ATOR que todos os serviços recebem. A alternativa seria passar o
   * `FastifyRequest` para dentro da camada de serviço só para a auditoria
   * enxergar o IP — o que acoplaria regra de negócio a HTTP em dezenas de
   * assinaturas.
   *
   * Opcionais porque nem todo ator vem de uma requisição: a varredura de
   * notificações e o seed rodam sem nenhuma.
   */
  ip?: string;
  userAgent?: string;
}

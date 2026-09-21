export type UserRole = 'ADMIN' | 'EMPLOYEE';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: string;
  user: AuthUser;
}

/**
 * Rótulos exibidos na interface.
 *
 * Os perfis são gravados em inglês no banco (convenção de schema) e traduzidos
 * na borda da aplicação. `Record<UserRole, string>` garante que, ao acrescentar
 * um perfil novo no futuro, o TypeScript acuse a tradução faltando.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  EMPLOYEE: 'Funcionário',
};

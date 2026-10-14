import type { UserRole } from '@/types/auth';

export type { UserRole };

/**
 * Usuário como a API o devolve.
 *
 * Não existe campo de senha aqui, e isso é intencional: o tipo espelha o
 * `USER_SELECT` do backend, que também não tem. Se um dia alguém acrescentar
 * `password` ao select por engano, a ausência deste campo no tipo não vai
 * impedir o vazamento — mas a revisão do diff fica evidente nos dois lados.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  /** Senha provisória em uso: a pessoa precisa trocá-la no próximo acesso. */
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListFilters {
  search?: string;
  role?: UserRole;
  status?: 'active' | 'inactive';
  sort?: 'name' | 'email' | 'role' | 'createdAt';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: UserRole;
  password: string;
  active: boolean;
}

export interface UpdateUserPayload {
  name: string;
  email: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * Resposta do reset de acesso.
 *
 * `temporaryPassword` chega uma única vez. Não é guardada em cache nem em
 * estado global de propósito — some quando o diálogo fecha, para não ficar
 * acessível no devtools depois que o administrador já a anotou.
 */
export interface ResetPasswordResult {
  user: User;
  temporaryPassword: string;
}

export const USER_ROLE_OPTIONS: UserRole[] = ['ADMIN', 'EMPLOYEE'];

/** Descrição do que cada perfil pode fazer — exibida ao escolher o perfil. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN:
    'Acesso total: financeiro consolidado, gerenciamento de usuários, exclusões e estornos.',
  EMPLOYEE:
    'Rotina de atendimento: clientes, contratos, faturas e pagamentos. Sem o financeiro do escritório e sem gerenciar usuários.',
};

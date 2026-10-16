import { apiRequest } from '@/services/api';
import type { LoginResponse } from '@/types/auth';
import type {
  ChangePasswordPayload,
  CreateUserPayload,
  Paginated,
  ResetPasswordResult,
  UpdateUserPayload,
  User,
  UserListFilters,
  UserRole,
  UserStatus,
} from '@/types/user';

/** Monta a query string ignorando filtros vazios. */
function buildQuery(filters: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text.length === 0) continue;
    params.set(key, text);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listUsers(
  filters: UserListFilters,
  signal?: AbortSignal,
): Promise<Paginated<User>> {
  return apiRequest<Paginated<User>>(`/users${buildQuery(filters)}`, signal ? { signal } : {});
}

export async function getUser(id: string, signal?: AbortSignal): Promise<User> {
  return apiRequest<User>(`/users/${id}`, signal ? { signal } : {});
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  return apiRequest<User>('/users', { method: 'POST', body: payload });
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  return apiRequest<User>(`/users/${id}`, { method: 'PUT', body: payload });
}

export async function updateUserRole(id: string, role: UserRole): Promise<User> {
  return apiRequest<User>(`/users/${id}/role`, { method: 'PATCH', body: { role } });
}

/** Aprovar ou desbloquear (ACTIVE) e bloquear (BLOCKED). */
export async function updateUserStatus(
  id: string,
  status: Exclude<UserStatus, 'PENDING'>,
): Promise<User> {
  return apiRequest<User>(`/users/${id}/status`, { method: 'PATCH', body: { status } });
}

export async function resetUserPassword(id: string): Promise<ResetPasswordResult> {
  return apiRequest<ResetPasswordResult>(`/users/${id}/reset-password`, { method: 'POST' });
}

/**
 * Troca da própria senha.
 *
 * Devolve uma sessão nova: o token anterior deixa de valer no instante da
 * troca, então quem não substituir o token guardado cai na tela de login na
 * requisição seguinte.
 */
export async function changeOwnPassword(payload: ChangePasswordPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/users/me/password', { method: 'POST', body: payload });
}

export async function deleteUser(id: string): Promise<void> {
  return apiRequest<void>(`/users/${id}`, { method: 'DELETE' });
}

import { apiRequest } from '@/services/api';
import type { HealthResponse } from '@/types/api';
import type { AuthUser, LoginCredentials, LoginResponse } from '@/types/auth';

/** POST /api/auth/login — rota pública, não envia token. */
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
    auth: false,
  });
}

/**
 * GET /api/auth/me — revalida a sessão.
 *
 * Chamada ao carregar a aplicação: confirma que o token guardado ainda é
 * aceito pela API e devolve os dados atuais do usuário (nome e perfil podem
 * ter mudado desde que o token foi emitido).
 */
export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiRequest<{ user: AuthUser }>('/auth/me');
  return response.user;
}

/**
 * POST /api/auth/logout — registra a saída na trilha de auditoria.
 *
 * O token é sem estado: quem encerra a sessão de fato é esta aplicação, apagando
 * o que guardou. A chamada existe para que a auditoria tenha a SAÍDA, e não
 * apenas entradas — sem ela, não haveria como distinguir uma sessão encerrada
 * de uma abandonada.
 *
 * Nunca lança: falhar ao avisar o servidor não pode impedir ninguém de sair.
 */
export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' });
  } catch {
    // Silencioso de propósito. O token é apagado pelo chamador de qualquer
    // forma, então a sessão termina mesmo se a API estiver fora do ar.
  }
}

/** GET /api/health — rota pública usada pelo indicador de status no topo. */
export async function fetchHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { auth: false });
}

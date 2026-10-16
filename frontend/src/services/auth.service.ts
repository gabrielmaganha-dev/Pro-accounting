import { getSupabase, hasStoredSupabaseState } from '@/lib/supabase';
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

// ---------------------------------------------------------------------------
// Login com Google (via Supabase Auth)
// ---------------------------------------------------------------------------

/** Falha do lado do Google/Supabase, antes de a API ser consultada. */
export class GoogleSignInError extends Error {
  readonly reason: 'not-configured' | 'exchange-failed';

  constructor(reason: GoogleSignInError['reason']) {
    super(reason);
    this.name = 'GoogleSignInError';
    this.reason = reason;
  }
}

/** Endereço para onde o Google (via Supabase) devolve a pessoa. */
export function googleCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * Leva a pessoa à tela de login do Google. A página é substituída — quem
 * chama não recebe "sucesso": recebe, se der errado, uma exceção.
 */
export async function startGoogleSignIn(): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) throw new GoogleSignInError('not-configured');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: googleCallbackUrl(),
      // Sempre mostra a escolha de conta: num computador com várias Contas
      // Google, entrar com a errada sem perceber é o erro mais comum.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) throw error;
}

/**
 * Conclui o login na volta do Google.
 *
 * 1. troca o código de uso único (PKCE) por uma sessão do Supabase;
 * 2. entrega o token dessa sessão à API, que confere a identidade no próprio
 *    Supabase e devolve a sessão DO SISTEMA (a mesma do login por senha);
 * 3. encerra a sessão do Supabase — ela só servia para provar a identidade.
 *
 * O passo 3 vem DEPOIS do 2 de propósito: encerrar antes invalidaria o token
 * que a API ainda precisa conferir.
 */
export async function completeGoogleSignIn(code: string): Promise<LoginResponse> {
  const supabase = await getSupabase();
  if (!supabase) throw new GoogleSignInError('not-configured');

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    throw new GoogleSignInError('exchange-failed');
  }

  try {
    return await apiRequest<LoginResponse>('/auth/google', {
      method: 'POST',
      body: { accessToken: data.session.access_token },
      auth: false,
    });
  } finally {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

/**
 * Limpa qualquer resto de sessão do Supabase no navegador (ao sair). Só
 * carrega a biblioteca se houver de fato algo guardado.
 */
export async function clearGoogleSession(): Promise<void> {
  if (!hasStoredSupabaseState()) return;

  const supabase = await getSupabase().catch(() => null);
  await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

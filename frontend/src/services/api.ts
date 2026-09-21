import { env } from '@/lib/env';
import type { ApiErrorCode, ApiFailure, ApiSuccess, FieldIssue } from '@/types/api';
import { tokenStorage } from '@/utils/storage';

/**
 * Erro normalizado de API.
 *
 * Toda falha — rede fora, 401, 422 de validação — chega às telas como uma
 * instância desta classe, com uma `message` já em português e pronta para ser
 * exibida. Nenhuma tela precisa inspecionar `response.status` na mão.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly issues: FieldIssue[] | undefined;

  constructor(message: string, status: number, code: ApiErrorCode, issues?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/**
 * Evento disparado quando a API rejeita o token em uma rota autenticada.
 *
 * O `AuthProvider` escuta e encerra a sessão. Usamos um evento do DOM porque
 * este módulo não é um componente React e, portanto, não tem acesso a contexto
 * nem a `navigate` — e transformá-lo em hook espalharia a lógica de
 * autenticação por toda a aplicação.
 */
export const UNAUTHORIZED_EVENT = 'pro-accounting:unauthorized';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  /** Anexa o token. Desative apenas em rotas públicas (login, health). */
  auth?: boolean;
}

function isApiSuccess<T>(payload: unknown): payload is ApiSuccess<T> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    (payload as { success: unknown }).success === true
  );
}

function extractFailure(payload: unknown): ApiFailure['error'] | null {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as { error: unknown }).error === 'object' &&
    (payload as { error: unknown }).error !== null
  ) {
    return (payload as ApiFailure).error;
  }
  return null;
}

/**
 * Cliente HTTP da aplicação.
 *
 * Usa `fetch` nativo em vez de axios: o que precisamos aqui (header de
 * autenticação, desembrulhar o envelope, normalizar o erro) cabe em poucas
 * linhas, e é uma dependência a menos para manter atualizada.
 */
export async function apiRequest<TData>(
  path: string,
  options: RequestOptions = {},
): Promise<TData> {
  const { method = 'GET', body, signal, auth = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers,
      ...(signal ? { signal } : {}),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    // Cancelamento não é falha: propaga para o TanStack Query tratar.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;

    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique se a API está em execução.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (response.status === 204) {
    return undefined as TData;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Resposta sem corpo JSON (ex.: erro de proxy devolvendo HTML).
    payload = null;
  }

  if (!response.ok) {
    const failure = extractFailure(payload);

    // 401 em rota autenticada significa token expirado ou revogado: limpa a
    // sessão antes de propagar, para não ficar tentando novamente com um
    // token que já sabemos ser inválido.
    if (response.status === 401 && auth) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(
      failure?.message ?? 'Erro inesperado ao comunicar com o servidor.',
      response.status,
      failure?.code ?? 'INTERNAL_ERROR',
      failure?.issues,
    );
  }

  // Rotas de negócio respondem { success: true, data }. A rota /health responde
  // o objeto cru — por isso o fallback.
  if (isApiSuccess<TData>(payload)) {
    return payload.data;
  }

  return payload as TData;
}

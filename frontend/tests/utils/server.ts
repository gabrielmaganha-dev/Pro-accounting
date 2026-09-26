import { vi } from 'vitest';

/**
 * API simulada no nível do `fetch`.
 *
 * As rotas são registradas como `"MÉTODO /caminho"` (sem o prefixo /api e sem
 * query string). Uma rota pode responder com um objeto fixo ou com uma função
 * que recebe a requisição — útil para conferir o corpo enviado ou responder
 * diferente a cada chamada.
 *
 * Requisição sem rota registrada falha o teste de propósito: uma chamada
 * inesperada à API quase sempre é um bug, e responder 404 silenciosamente
 * esconderia isso.
 */

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  /** Atraso artificial, para observar estados de carregamento. */
  delayMs?: number;
}

export type RouteHandler = MockResponse | ((request: MockRequest) => MockResponse);

export const API_BASE = 'http://api.teste/api';

/** Envelope de sucesso da API. */
export function ok(data: unknown, status = 200): MockResponse {
  return { status, body: { success: true, data } };
}

/** Envelope de erro da API. */
export function fail(
  status: number,
  code: string,
  message: string,
  issues?: { field: string; message: string }[],
): MockResponse {
  return {
    status,
    body: { success: false, error: issues ? { code, message, issues } : { code, message } },
  };
}

export function mockApi(routes: Record<string, RouteHandler>) {
  const requests: MockRequest[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api/, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;

    const request: MockRequest = { method, path, query: url.searchParams, body, headers };
    requests.push(request);

    const key = `${method} ${path}`;
    const route =
      routes[key] ??
      Object.entries(routes).find(([pattern]) => matches(pattern, key))?.[1];

    if (!route) {
      throw new Error(`[mockApi] rota não simulada: ${key}`);
    }

    const response = typeof route === 'function' ? route(request) : route;

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    const status = response.status ?? 200;

    return new Response(status === 204 ? null : JSON.stringify(response.body ?? null), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);

  return { fetchMock, requests };
}

/** `GET /clients/:id` casa com `GET /clients/abc`. */
function matches(pattern: string, key: string): boolean {
  if (!pattern.includes(':')) return false;

  const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`);
  return regex.test(key);
}

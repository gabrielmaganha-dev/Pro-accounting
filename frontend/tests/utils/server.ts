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
  /**
   * Corpo cru, para as rotas que devolvem ARQUIVO (exportações, fatura em PDF)
   * em vez do envelope JSON. Vai com `headers`, ex.: `Content-Disposition`.
   */
  raw?: BodyInit;
  headers?: Record<string, string>;
}

/** Resposta de arquivo, como as rotas de exportação e de PDF. */
export function file(content: string, contentType: string, filename: string): MockResponse {
  return {
    raw: new Blob([content], { type: contentType }),
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  };
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

/**
 * Chamadas que o layout autenticado faz em TODA tela: a identidade visual do
 * escritório e o sino de notificações. Respondidas por padrão para cada teste
 * não precisar repeti-las; um teste que queira outro comportamento registra a
 * própria rota, que tem prioridade.
 */
const LAYOUT_ROUTES: Record<string, RouteHandler> = {
  'GET /settings': ok({
    settings: {
      id: 'settings',
      companyName: 'Escritório de Teste',
      companyCnpj: null,
      companyEmail: null,
      companyPhone: null,
      companyWebsite: null,
      companyZipCode: null,
      companyStreet: null,
      companyNumber: null,
      companyComplement: null,
      companyNeighborhood: null,
      companyCity: null,
      companyState: null,
      invoicePaymentInstructions: 'PIX CNPJ 11222333000181',
      logo: null,
      primaryColor: '#1d4ed8',
      secondaryColor: '#f59e0b',
      dueSoonDays: 7,
      currency: 'BRL',
      timeZone: 'America/Sao_Paulo',
      dateFormat: 'dd/MM/yyyy',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: null,
    },
    options: { currencies: ['BRL'], timeZones: ['America/Sao_Paulo'], dateFormats: ['dd/MM/yyyy'] },
  }),
  'GET /notifications': ok({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0, unreadCount: 0 }),
};

export function mockApi(ownRoutes: Record<string, RouteHandler>) {
  const routes: Record<string, RouteHandler> = { ...LAYOUT_ROUTES, ...ownRoutes };
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

    if (response.raw !== undefined) {
      return new Response(response.raw, { status, headers: response.headers ?? {} });
    }

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

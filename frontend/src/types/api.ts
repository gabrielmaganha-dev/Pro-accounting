/**
 * Espelho dos tipos de resposta da API (backend/src/utils/api-response.ts).
 *
 * Mantidos manualmente em sincronia nesta etapa. A partir do momento em que o
 * número de endpoints crescer, vale extrair estes tipos para um pacote
 * compartilhado entre frontend e backend.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  /** Rota prevista no contrato, mas ainda sem implementação (ex.: export PDF). */
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR'
  /** Exclusivo do cliente: a requisição nem chegou ao servidor. */
  | 'NETWORK_ERROR';

export interface FieldIssue {
  field: string;
  message: string;
}

export interface ApiSuccess<TData> {
  success: true;
  data: TData;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: FieldIssue[];
  };
}

/** Resposta de GET /api/health — não usa o envelope, por ser rota de probe. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  database: 'connected' | 'disconnected';
  uptime: number;
  timestamp: string;
}

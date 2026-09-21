import type { AppErrorCode, FieldIssue } from './app-error.js';

/**
 * Envelope padrão das respostas da API.
 *
 * Toda rota (exceto `/api/health`, que segue o formato de probe) responde num
 * destes dois formatos. Com isso o cliente HTTP do frontend consegue tratar
 * sucesso e erro num único lugar, sem `if` espalhado por tela.
 */

export interface ApiSuccess<TData> {
  success: true;
  data: TData;
}

export interface ApiFailure {
  success: false;
  error: {
    code: AppErrorCode;
    message: string;
    /** Presente apenas em erros de validação. */
    issues?: FieldIssue[];
  };
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export function ok<TData>(data: TData): ApiSuccess<TData> {
  return { success: true, data };
}

export function fail(code: AppErrorCode, message: string, issues?: FieldIssue[]): ApiFailure {
  return {
    success: false,
    error: issues ? { code, message, issues } : { code, message },
  };
}

/**
 * Erro de aplicação — o único tipo de erro que a API lança de propósito.
 *
 * Qualquer outra exceção que chegue ao handler central é tratada como falha
 * inesperada (500) e tem a mensagem suprimida em produção, para não vazar
 * detalhes internos do sistema.
 */

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

/** Erro ligado a um campo específico do formulário, para destaque na interface. */
export interface FieldIssue {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: AppErrorCode;
  readonly issues: FieldIssue[] | undefined;

  constructor(message: string, statusCode: number, code: AppErrorCode, issues?: FieldIssue[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.issues = issues;

    // Mantém o stack trace apontando para quem lançou, não para este construtor.
    Error.captureStackTrace(this, AppError);
  }

  static validation(message = 'Dados inválidos.', issues?: FieldIssue[]): AppError {
    return new AppError(message, 422, 'VALIDATION_ERROR', issues);
  }

  static unauthorized(message = 'Sessão expirada. Faça login novamente.'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Você não tem permissão para acessar este recurso.'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Registro não encontrado.'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message = 'Já existe um registro com estes dados.'): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  static tooManyRequests(message = 'Muitas tentativas. Aguarde alguns instantes.'): AppError {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }

  /**
   * Recurso previsto no contrato da API, mas ainda sem implementação.
   *
   * Distinto de 404: a rota existe e a requisição está correta. É o que
   * permite a API anunciar um formato de exportação planejado sem fingir que
   * ele já funciona — e sem devolver um erro genérico que pareceria bug.
   */
  static notImplemented(message = 'Recurso ainda não disponível.'): AppError {
    return new AppError(message, 501, 'NOT_IMPLEMENTED');
  }

  static internal(message = 'Erro interno do servidor.'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}

/** Type guard usado pelo handler central de erros. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { type AppErrorCode, type FieldIssue, isAppError } from '../utils/app-error.js';
import { fail } from '../utils/api-response.js';

interface NormalizedError {
  statusCode: number;
  code: AppErrorCode;
  message: string;
  issues?: FieldIssue[];
  /** Falhas inesperadas viram log de erro; as previstas, log de aviso. */
  unexpected: boolean;
}

/**
 * Traduz qualquer exceção para o envelope de erro da API.
 *
 * Regra que vale para todos os ramos: a mensagem devolvida ao cliente é
 * escrita para o usuário final, em português, e nunca contém stack trace,
 * SQL, nome de tabela ou detalhe de infraestrutura.
 */
function normalize(error: FastifyError | Error): NormalizedError {
  // 1. Erros que a própria aplicação lançou de propósito.
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.issues ? { issues: error.issues } : {}),
      unexpected: false,
    };
  }

  // 2. Validação Zod que escapou de `validate()`.
  if (error instanceof ZodError) {
    const issues: FieldIssue[] = error.issues.map((issue) => ({
      field: issue.path.join('.') || '(corpo da requisição)',
      message: issue.message,
    }));

    return {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: issues[0]?.message ?? 'Dados inválidos.',
      issues,
      unexpected: false,
    };
  }

  // 3. Erros conhecidos do Prisma — traduzidos para linguagem de negócio.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        // Violação de índice único.
        const target = error.meta?.['target'];
        const fields = Array.isArray(target) ? target.join(', ') : String(target ?? '');
        return {
          statusCode: 409,
          code: 'CONFLICT',
          message: fields
            ? `Já existe um registro com este valor em: ${fields}.`
            : 'Já existe um registro com estes dados.',
          unexpected: false,
        };
      }
      case 'P2003':
        return {
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Operação bloqueada: existe outro registro vinculado a este.',
          unexpected: false,
        };
      case 'P2025':
        return {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Registro não encontrado.',
          unexpected: false,
        };
      default:
        return {
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: 'Erro ao acessar o banco de dados.',
          unexpected: true,
        };
    }
  }

  // 4. Banco inacessível (container parado, credenciais erradas, rede caída).
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      statusCode: 503,
      code: 'INTERNAL_ERROR',
      message: 'Banco de dados indisponível no momento. Tente novamente em instantes.',
      unexpected: true,
    };
  }

  const fastifyError = error as FastifyError;

  // 5. Limite de requisições (@fastify/rate-limit).
  if (fastifyError.statusCode === 429) {
    return {
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
      unexpected: false,
    };
  }

  // 6. Erros que o próprio Fastify gera antes do handler: corpo malformado,
  //    Content-Type inadequado, payload grande demais.
  //
  //    Vale diferenciar as causas. Uma resposta genérica "Requisição inválida."
  //    para um JSON quebrado deixa quem está integrando sem pista nenhuma do
  //    que corrigir — foi exatamente o que aconteceu nos testes desta etapa.
  if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
    const fastifyCode = fastifyError.code ?? '';

    let message = 'Requisição inválida.';

    if (fastifyError.statusCode === 404) {
      message = 'Recurso não encontrado.';
    } else if (fastifyError.statusCode === 413) {
      message = 'O conteúdo enviado é grande demais.';
    } else if (fastifyError.statusCode === 415 || fastifyCode.includes('INVALID_MEDIA_TYPE')) {
      message = 'Formato de conteúdo não suportado. Envie JSON com Content-Type: application/json.';
    } else if (fastifyCode.includes('EMPTY_JSON_BODY')) {
      message = 'O corpo da requisição está vazio.';
    } else if (fastifyCode.startsWith('FST_ERR_CTP')) {
      message = 'Não foi possível ler os dados enviados: o JSON está malformado.';
    }

    return {
      statusCode: fastifyError.statusCode,
      code: fastifyError.statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      message,
      unexpected: false,
    };
  }

  // 7. Qualquer outra coisa: bug. Detalhe só no log.
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor.',
    unexpected: true,
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const normalized = normalize(error);

    if (normalized.unexpected) {
      request.log.error(
        { err: error, url: request.url, method: request.method },
        'Falha não tratada',
      );
    } else {
      request.log.warn(
        { code: normalized.code, url: request.url, method: request.method },
        normalized.message,
      );
    }

    // Em desenvolvimento, mostra a mensagem real do erro inesperado para
    // encurtar a depuração. Em produção, nunca.
    const message =
      normalized.unexpected && env.isDevelopment && error.message
        ? `${normalized.message} (dev: ${error.message})`
        : normalized.message;

    return reply
      .status(normalized.statusCode)
      .send(fail(normalized.code, message, normalized.issues));
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .status(404)
      .send(fail('NOT_FOUND', `Rota não encontrada: ${request.method} ${request.url}`));
  });
}

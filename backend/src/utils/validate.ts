import type { z } from 'zod';

import { AppError, type FieldIssue } from './app-error.js';

/**
 * Valida uma entrada contra um schema Zod e devolve o dado já tipado.
 *
 * Em caso de falha, converte os issues do Zod no formato que o frontend usa
 * para destacar campo a campo no formulário — em vez de jogar o erro cru do
 * Zod, que é verboso e não é legível para o usuário final.
 *
 * Todo dado vindo do cliente (body, query, params) passa por aqui antes de
 * chegar ao banco. É o que impede tipos inesperados de atravessarem a API.
 */
export function validate<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const issues: FieldIssue[] = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(corpo da requisição)',
      message: issue.message,
    }));

    const message = issues[0]?.message ?? 'Dados inválidos.';

    throw AppError.validation(message, issues);
  }

  return result.data;
}

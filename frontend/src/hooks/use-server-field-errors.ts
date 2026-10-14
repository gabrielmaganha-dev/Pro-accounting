import { useEffect } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { ApiError } from '@/services/api';

interface Options<TValues extends FieldValues> {
  /**
   * Campo que recebe a mensagem de um 409 de duplicidade (CPF/CNPJ, número).
   *
   * O 409 não traz `issues` — é uma recusa de negócio, não de formato —, mas
   * quase sempre diz respeito a um campo específico. Sem isto a mensagem
   * aparecia só num toast que some em segundos, e o campo errado continuava
   * sem destaque.
   */
  conflictField?: Path<TValues>;
  /** Só aplica o 409 ao campo quando a mensagem casa com este padrão. */
  conflictPattern?: RegExp;
}

/**
 * Leva os erros da API para os campos do formulário.
 *
 * A validação do navegador espelha a da API, mas não é idêntica: a unicidade,
 * por exemplo, só o servidor conhece. Quando a API recusa, cada `issue` vira
 * mensagem embaixo do campo correspondente — a mesma experiência de um erro
 * pego no navegador.
 */
export function useServerFieldErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  error: unknown,
  { conflictField, conflictPattern }: Options<TValues> = {},
): void {
  useEffect(() => {
    if (!(error instanceof ApiError)) return;

    const knownFields = Object.keys(form.getValues());
    let focused = false;

    for (const issue of error.issues ?? []) {
      if (!knownFields.includes(issue.field)) continue;

      form.setError(
        issue.field as Path<TValues>,
        { type: 'server', message: issue.message },
        { shouldFocus: !focused },
      );
      focused = true;
    }

    const isFieldConflict =
      error.status === 409 &&
      conflictField !== undefined &&
      (conflictPattern === undefined || conflictPattern.test(error.message));

    if (!focused && isFieldConflict) {
      form.setError(conflictField, { type: 'server', message: error.message }, { shouldFocus: true });
    }
    // `form` é estável entre renderizações; o efeito reage só a um erro novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
}

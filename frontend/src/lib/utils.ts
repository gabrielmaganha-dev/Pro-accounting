import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina classes do Tailwind resolvendo conflitos.
 *
 * `clsx` junta condicionais; `twMerge` garante que a última classe vença
 * quando duas disputam a mesma propriedade. Sem ele,
 * `cn('px-4', 'px-6')` geraria "px-4 px-6" e o resultado dependeria da ordem
 * no CSS gerado — que não é a ordem do atributo class.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

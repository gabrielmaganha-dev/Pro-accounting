/**
 * Ponto de troca entre cartões (celular) e tabela (telas largas) nas listagens.
 *
 * Fica fora do componente para o arquivo do componente exportar só
 * componentes (exigência do fast refresh do Vite). As classes são literais
 * porque o Tailwind só gera o que encontra escrito no código.
 */
export type ListBreakpoint = 'md' | 'lg' | 'xl';

export const LIST_HIDDEN_FROM: Record<ListBreakpoint, string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
};

const TABLE_VISIBLE_FROM: Record<ListBreakpoint, string> = {
  md: 'hidden md:block',
  lg: 'hidden lg:block',
  xl: 'hidden xl:block',
};

/** Classe do invólucro da tabela que substitui a lista a partir de `breakpoint`. */
export function tableFrom(breakpoint: ListBreakpoint): string {
  return TABLE_VISIBLE_FROM[breakpoint];
}

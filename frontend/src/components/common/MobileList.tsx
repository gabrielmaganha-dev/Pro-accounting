import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { LIST_HIDDEN_FROM, type ListBreakpoint } from '@/lib/list-layout';
import { cn } from '@/lib/utils';

/**
 * Listagem em cartões para telas estreitas.
 *
 * Abaixo de certa largura uma tabela de oito colunas só funciona com rolagem
 * lateral, e o que fica escondido à direita é justamente o que importa:
 * situação e ações. Aqui cada registro vira um bloco tocável com as
 * informações empilhadas — o mesmo formato em todos os módulos.
 *
 * O ponto de troca (`until`) é escolhido por listagem, conforme a densidade da
 * tabela: a partir de lg o menu lateral ocupa 256px, então a área útil em lg é
 * quase a mesma de um tablet. Uma tabela larga (faturas) precisa de mais
 * espaço do que uma estreita (clientes) antes de caber sem rolagem.
 *
 * Uso (tableFrom vem de @/lib/list-layout):
 *   <MobileList until="lg">…</MobileList>
 *   <div className={tableFrom('lg')}><Table>…</Table></div>
 */
export function MobileList({
  children,
  label,
  until = 'md',
}: {
  children: ReactNode;
  label: string;
  until?: ListBreakpoint;
}) {
  return (
    <ul className={cn('divide-y divide-border', LIST_HIDDEN_FROM[until])} aria-label={label}>
      {children}
    </ul>
  );
}

interface MobileListItemProps {
  /** Destino ao tocar. Ausente = linha informativa, sem navegação. */
  to?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Canto superior direito — normalmente o valor. */
  aside?: ReactNode;
  /** Linha de rodapé: situação e datas. */
  footer?: ReactNode;
  /**
   * Ação própria da linha (ex.: "Estornar"). Fica FORA do link, como irmã: um
   * botão dentro de um link é HTML inválido, e o toque dispararia os dois.
   */
  action?: ReactNode;
}

export function MobileListItem({ to, title, subtitle, aside, footer, action }: MobileListItemProps) {
  const content = (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate font-medium text-foreground">{title}</p>
        {aside && (
          <div className="shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
            {aside}
          </div>
        )}
      </div>

      {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}

      {footer && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );

  return (
    <li className="flex items-center">
      {to ? (
        <Link
          to={to}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 transition-colors',
            'hover:bg-secondary/60 active:bg-secondary',
            'focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          )}
        >
          {content}
          {!action && (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">{content}</div>
      )}

      {action && <div className="shrink-0 pr-3">{action}</div>}
    </li>
  );
}

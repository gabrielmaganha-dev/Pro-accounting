import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface SortableHeadProps<TColumn extends string> {
  label: string;
  column: TColumn;
  activeColumn: string;
  order: 'asc' | 'desc';
  onSort: (column: TColumn) => void;
  className?: string;
}

/**
 * Cabeçalho de coluna ordenável — o mesmo em todas as listagens.
 *
 * Antes cada tela tinha a sua cópia, com um botão de 16px de altura: difícil de
 * acertar no toque e sem `aria-sort`, então o leitor de tela não dizia qual
 * coluna estava ordenando a tabela. O ícone neutro nas colunas inativas mostra
 * que elas também são clicáveis.
 */
export function SortableHead<TColumn extends string>({
  label,
  column,
  activeColumn,
  order,
  onSort,
  className,
}: SortableHeadProps<TColumn>) {
  const isActive = activeColumn === column;
  const Icon = !isActive ? ArrowUpDown : order === 'asc' ? ArrowUpAZ : ArrowDownAZ;

  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          '-mx-2 inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold uppercase tracking-wide transition-colors',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'text-foreground',
        )}
      >
        {label}
        <Icon
          className={cn('size-3.5', !isActive && 'opacity-40')}
          aria-hidden="true"
        />
        <span className="sr-only">
          {isActive
            ? `, ordenado em ordem ${order === 'asc' ? 'crescente' : 'decrescente'}`
            : ', clique para ordenar'}
        </span>
      </button>
    </TableHead>
  );
}

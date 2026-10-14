import { ArrowUpDown } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SortOption<TColumn extends string> {
  column: TColumn;
  label: string;
}

interface SortSelectProps<TColumn extends string> {
  options: SortOption<TColumn>[];
  sort: TColumn;
  order: 'asc' | 'desc';
  onChange: (column: TColumn, order: 'asc' | 'desc') => void;
  /** Normalmente a classe que o esconde a partir de certa largura. */
  className?: string;
}

/**
 * Ordenação pela barra de filtros.
 *
 * A ordenação principal é o cabeçalho da tabela — mas nas telas estreitas
 * várias colunas não existem, e a coluna que some leva o botão de ordenar
 * junto. Sem este seletor, no celular não havia como ordenar faturas por
 * vencimento nem ver por qual coluna a lista estava ordenada; e, tendo
 * ordenado clientes por nome num notebook, não havia como voltar a "mais
 * recentes".
 *
 * Cada tela o esconde a partir da largura em que todos os cabeçalhos
 * ordenáveis já estão visíveis, para não haver dois controles para a mesma
 * coisa.
 */
export function SortSelect<TColumn extends string>({
  options,
  sort,
  order,
  onChange,
  className,
}: SortSelectProps<TColumn>) {
  return (
    <Select
      value={`${sort}:${order}`}
      onValueChange={(value) => {
        const [column, nextOrder] = value.split(':') as [TColumn, 'asc' | 'desc'];
        onChange(column, nextOrder);
      }}
    >
      <SelectTrigger
        className={cn('min-w-[200px] flex-1 sm:w-[270px] sm:flex-none', className)}
        aria-label="Ordenar por"
      >
        {/* <div>, não <span>: o gatilho aplica line-clamp a todo <span> filho
            direto, o que desmontaria o alinhamento do ícone com o texto. */}
        <div className="flex min-w-0 items-center gap-2">
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">
            <SelectValue />
          </span>
        </div>
      </SelectTrigger>

      <SelectContent>
        {options.flatMap((option) => [
          <SelectItem key={`${option.column}:asc`} value={`${option.column}:asc`}>
            {option.label} · crescente
          </SelectItem>,
          <SelectItem key={`${option.column}:desc`} value={`${option.column}:desc`}>
            {option.label} · decrescente
          </SelectItem>,
        ])}
      </SelectContent>
    </Select>
  );
}

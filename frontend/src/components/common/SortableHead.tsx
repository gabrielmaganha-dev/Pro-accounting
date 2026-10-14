import { SortButton } from '@/components/common/SortButton';
import { TableHead } from '@/components/ui/table';

interface SortableHeadProps<TColumn extends string> {
  label: string;
  column: TColumn;
  activeColumn: string;
  order: 'asc' | 'desc';
  onClick: (column: TColumn) => void;
  className?: string;
}

/**
 * Cabeçalho de coluna ordenável: o `<th>` com `aria-sort` e o botão dentro.
 *
 * O `aria-sort` precisa ficar no `<th>`, não no botão — é ali que o leitor de
 * tela procura ao percorrer a tabela célula a célula. Juntar os dois num
 * componente garante que nenhuma listagem tenha o botão sem o atributo.
 */
export function SortableHead<TColumn extends string>({
  label,
  column,
  activeColumn,
  order,
  onClick,
  className,
}: SortableHeadProps<TColumn>) {
  const isActive = activeColumn === column;

  return (
    <TableHead
      aria-sort={isActive ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      {...(className ? { className } : {})}
    >
      <SortButton
        label={label}
        column={column}
        activeColumn={activeColumn}
        order={order}
        onClick={onClick}
      />
    </TableHead>
  );
}

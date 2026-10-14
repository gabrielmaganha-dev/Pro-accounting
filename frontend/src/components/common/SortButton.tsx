import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

interface SortButtonProps<TColumn extends string> {
  label: string;
  column: TColumn;
  activeColumn: string;
  order: 'asc' | 'desc';
  onClick: (column: TColumn) => void;
}

/**
 * Cabeçalho de coluna ordenável.
 *
 * Um só componente para todas as listagens: antes cada tela trazia a própria
 * cópia, e bastava ajustar uma para as tabelas deixarem de se parecer.
 *
 * Setas neutras em vez de "A→Z": a mesma coluna ordena nome, data e valor, e
 * um ícone de alfabeto sobre uma coluna de vencimento informa a coisa errada.
 */
export function SortButton<TColumn extends string>({
  label,
  column,
  activeColumn,
  order,
  onClick,
}: SortButtonProps<TColumn>) {
  const isActive = activeColumn === column;

  return (
    <button
      type="button"
      onClick={() => onClick(column)}
      // A área de toque é mais alta que o texto: 16px de altura é impossível
      // de acertar com o dedo. A margem negativa devolve o espaço ao cabeçalho.
      className="-mx-1 -my-2 inline-flex min-h-9 items-center gap-1 rounded px-1 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground"
      // O estado entra no rótulo: só o ícone não diz nada a um leitor de tela.
      aria-label={
        isActive
          ? `Ordenar por ${label} — atualmente ${order === 'asc' ? 'crescente' : 'decrescente'}`
          : `Ordenar por ${label}`
      }
    >
      {label}
      {isActive ? (
        order === 'asc' ? (
          <ArrowUp className="size-3.5 text-foreground" aria-hidden="true" />
        ) : (
          <ArrowDown className="size-3.5 text-foreground" aria-hidden="true" />
        )
      ) : (
        // Marca discreta de que a coluna ordena — sem ela, só passando o mouse
        // por cima se descobre, e no celular não existe "passar o mouse".
        <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden="true" />
      )}
    </button>
  );
}

import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  /** Linhas exibidas enquanto os dados não chegam. */
  rows?: number;
}

/**
 * Esqueleto de listagem.
 *
 * A forma imita a linha real — título, subtítulo e um selo à direita — para
 * que a tabela não "pule" quando os dados chegam. É o mesmo em todas as telas:
 * o carregamento de Clientes e o de Faturas precisam parecer o mesmo sistema.
 */
export function TableSkeleton({ rows = 6 }: TableSkeletonProps) {
  return (
    // role="status" faz o leitor de tela anunciar o carregamento; sem ele a
    // tela simplesmente fica muda até a tabela aparecer.
    <div role="status" aria-live="polite" className="divide-y divide-border">
      <span className="sr-only">Carregando…</span>

      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} aria-hidden="true" className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto das listagens — o mesmo desenho em todos os módulos, em vez de uma
 * variação por tela. Tem a forma de uma linha (título, subtítulo, valor e
 * etiqueta de situação), que serve tanto à tabela do desktop quanto aos
 * cartões do celular.
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-border"
      role="status"
      aria-live="polite"
      aria-label="Carregando registros"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5 max-w-[12rem]" />
            <Skeleton className="h-3 w-3/5 max-w-[16rem]" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

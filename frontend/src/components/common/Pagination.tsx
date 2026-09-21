import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Desabilita os botões durante um carregamento. */
  disabled?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  disabled = false,
}: PaginationProps) {
  if (total === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      {/* "21–40 de 137" responde duas perguntas que "página 2 de 7" não
          responde: quantos registros existem ao todo e onde estou neles. */}
      <p className="text-xs text-muted-foreground">
        Exibindo <span className="font-medium tabular-nums text-foreground">{firstItem}</span>–
        <span className="font-medium tabular-nums text-foreground">{lastItem}</span> de{' '}
        <span className="font-medium tabular-nums text-foreground">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <span className="px-1 text-xs tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SummaryTileProps {
  label: string;
  value: string;
  hint?: string | undefined;
  /** Classe de cor do valor (ex.: `text-emerald-700`). Padrão: cor do texto. */
  tone?: string | undefined;
  icon?: LucideIcon;
  isLoading?: boolean;
}

/**
 * Bloco de resumo: um número com rótulo, no topo das telas de consulta.
 *
 * Existia uma cópia em cada tela — ficha do cliente, do contrato, da fatura,
 * Financeiro, Auditoria e Relatórios — cada uma com um tamanho de fonte e uma
 * caixa de rótulo diferentes. Agora há uma só, e o "resumo" tem a mesma cara em
 * qualquer módulo.
 *
 * Diferente do `StatCard` do painel, que é maior e leva ícone colorido: lá o
 * número é o conteúdo da tela; aqui ele é cabeçalho do que vem embaixo.
 */
export function SummaryTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  isLoading = false,
}: SummaryTileProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </div>

        {isLoading ? (
          <Skeleton className="mt-2 h-6 w-28 max-w-full" />
        ) : (
          <p
            className={cn(
              // break-words em vez de truncate: um valor cortado com
              // reticências num card financeiro é um valor errado.
              'mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl',
              tone ?? 'text-foreground',
            )}
          >
            {value}
          </p>
        )}

        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

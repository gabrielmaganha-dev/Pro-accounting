import type { ReactNode } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: string;
  isLoading?: boolean;
  /** Verdadeiro quando a consulta voltou, mas sem nada para desenhar. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Altura da área do gráfico. Fixa para o layout não pular ao carregar. */
  height?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** Permite ao chamador definir o encaixe no grid (ex.: `xl:col-span-2`). */
  className?: string;
}

/**
 * Moldura dos gráficos.
 *
 * Centraliza os três estados que todo gráfico precisa ter — carregando, vazio
 * e com dados — para que nenhum deles seja esquecido em um dos quatro
 * gráficos. A altura é fixa nos três: se o esqueleto tivesse altura diferente
 * do gráfico, a página inteira saltaria quando os dados chegassem.
 */
export function ChartCard({
  title,
  description,
  isLoading = false,
  isEmpty = false,
  emptyTitle = 'Sem dados no período',
  emptyDescription,
  height = 280,
  children,
  footer,
  className,
}: ChartCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col pt-2">
        <div style={{ height }} className="w-full">
          {isLoading ? (
            <ChartSkeleton />
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState title={emptyTitle} {...(emptyDescription ? { description: emptyDescription } : {})} compact />
            </div>
          ) : (
            children
          )}
        </div>

        {footer && !isLoading && !isEmpty && <div className="mt-4">{footer}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Esqueleto com silhueta de gráfico de barras.
 *
 * Barras de alturas variadas comunicam "vem um gráfico aqui" melhor do que um
 * retângulo cinza uniforme, que parece uma imagem quebrada.
 */
function ChartSkeleton() {
  const heights = ['40%', '65%', '50%', '80%', '55%', '70%', '45%', '75%'];

  return (
    <div className="flex h-full w-full items-end gap-2 px-2 pb-6" aria-hidden="true">
      {heights.map((barHeight, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height: barHeight }} />
      ))}
    </div>
  );
}

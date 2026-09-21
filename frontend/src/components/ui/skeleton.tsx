import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Espaço reservado durante o carregamento.
 *
 * Preferido ao spinner em listas e cards: mantém o layout estável e o conteúdo
 * não "pula" quando os dados chegam.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} {...props} />;
}

export { Skeleton };

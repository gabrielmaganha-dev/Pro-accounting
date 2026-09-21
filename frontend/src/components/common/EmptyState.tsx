import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Ação sugerida (botão, link). */
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * Estado vazio.
 *
 * Um painel sem dados não pode parecer um painel quebrado. A diferença entre
 * "ainda não há faturas" e "falhou ao carregar" precisa estar explícita, senão
 * o usuário liga para o suporte por um sistema que está funcionando.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full bg-slate-100 text-slate-400',
          compact ? 'size-10' : 'size-12',
        )}
      >
        <Icon className={compact ? 'size-5' : 'size-6'} />
      </span>

      <p className={cn('font-medium text-foreground', compact && 'text-sm')}>{title}</p>

      {description && (
        <p className="max-w-xs text-xs text-muted-foreground sm:text-sm">{description}</p>
      )}

      {action}
    </div>
  );
}

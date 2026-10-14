import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: string;
  /** Mensagem da falha — normalmente `error.message`, já em português. */
  description?: string | undefined;
  /** Refaz a consulta. Sem ela o botão não aparece. */
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
  compact?: boolean;
}

/**
 * Estado de erro.
 *
 * Separado do `EmptyState` de propósito: "não há faturas" e "falhou ao
 * carregar" são situações opostas e não podem ter a mesma cara. Aqui o ícone é
 * vermelho, a região é anunciada como alerta e — o que mais importa — existe
 * um caminho de saída: tentar de novo sem recarregar a página inteira.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  isRetrying = false,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full bg-red-50 text-red-600',
          compact ? 'size-10' : 'size-12',
        )}
      >
        <AlertTriangle className={compact ? 'size-5' : 'size-6'} />
      </span>

      <p className={cn('font-medium text-foreground', compact && 'text-sm')}>{title}</p>

      {description && (
        <p className="max-w-sm text-xs text-muted-foreground sm:text-sm">{description}</p>
      )}

      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
          <RefreshCw className={isRetrying ? 'animate-spin' : undefined} />
          {isRetrying ? 'Tentando…' : 'Tentar novamente'}
        </Button>
      )}
    </div>
  );
}

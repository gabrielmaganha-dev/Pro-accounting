import { AlertTriangle, RefreshCw } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/api';

interface ErrorStateProps {
  title: string;
  error: unknown;
  /** Repete a consulta — normalmente o `refetch` do TanStack Query. */
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
}

/**
 * Falha ao carregar — o mesmo desenho em todas as telas.
 *
 * Existe separado do estado vazio porque os dois precisam ser inconfundíveis:
 * "nenhuma fatura" dito quando a consulta FALHOU faz o usuário concluir que o
 * cliente não tem faturas. Aqui o ícone é de alerta, a mensagem é a da API e
 * há sempre um caminho para tentar de novo sem recarregar a página inteira.
 */
export function ErrorState({ title, error, onRetry, isRetrying = false, compact }: ErrorStateProps) {
  const description =
    error instanceof ApiError
      ? error.message
      : 'Ocorreu um erro inesperado ao consultar o servidor.';

  return (
    <EmptyState
      tone="danger"
      icon={AlertTriangle}
      title={title}
      description={description}
      {...(compact ? { compact } : {})}
      {...(onRetry
        ? {
            action: (
              <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
                <RefreshCw className={isRetrying ? 'animate-spin' : undefined} />
                Tentar novamente
              </Button>
            ),
          }
        : {})}
    />
  );
}

import { Loader2 } from 'lucide-react';

import { Logo } from '@/components/brand/Logo';

/**
 * Tela cheia de carregamento.
 *
 * Exibida enquanto a sessão guardada é revalidada na API. Sem ela, haveria um
 * piscar da tela de login antes do painel aparecer para quem já estava logado.
 */
export function FullPageLoader({ message = 'Carregando…' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4"
    >
      <Logo variant="full" size={44} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  );
}

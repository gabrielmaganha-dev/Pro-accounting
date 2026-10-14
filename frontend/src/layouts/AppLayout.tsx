import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary';
import { SidebarContent } from '@/components/layout/SidebarContent';
import { ThemeLoader } from '@/components/layout/ThemeLoader';
import { Topbar } from '@/components/layout/Topbar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Casca do painel administrativo.
 *
 * Responsividade:
 *  • ≥1024px (lg): menu lateral fixo de 256px; o conteúdo recebe padding-left
 *    equivalente. O menu não rola junto com a página.
 *  • <1024px: o menu vira gaveta sobre o conteúdo, aberta pelo botão do topo.
 */
export function AppLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Fecha a gaveta ao trocar de rota — sem isto ela continuaria aberta por
  // cima da tela recém-carregada.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <ThemeLoader />

      {/* Atalho de teclado: sem ele, quem navega por Tab atravessa os dez
          itens do menu a cada troca de página antes de chegar ao conteúdo.
          Fica invisível até receber foco. */}
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-72 border-r-0 p-0" hideCloseButton>
          {/* O Radix exige título e descrição para leitores de tela. Ficam
              ocultos visualmente porque o menu já se explica sozinho. */}
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SheetDescription className="sr-only">
            Acesse as áreas do sistema Pro Accounting.
          </SheetDescription>
          <SidebarContent onNavigate={() => setIsMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <Topbar onOpenMenu={() => setIsMobileMenuOpen(true)} />

        {/* tabIndex -1: permite ao link "Pular para o conteúdo" mover o foco
            para cá sem colocar o <main> na ordem normal do Tab. */}
        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1400px] px-4 py-6 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-6 lg:px-8"
        >
          {/* Fronteira de carregamento das telas sob demanda (ver routes/).
              Fica AQUI, dentro do <main>, para que menu e barra do topo
              continuem na tela enquanto o código da página chega — a troca
              parece navegação, não recarregamento. A barreira de erro em volta
              cobre o caso em que o código não chega, ou em que a tela falha ao
              renderizar: só esta área vira aviso, o resto continua de pé. */}
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}

/** Esqueleto genérico de página: título, barra de filtros e um bloco de conteúdo. */
function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Carregando…</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton aria-hidden="true" className="h-16 w-full rounded-lg" />
      <Skeleton aria-hidden="true" className="h-72 w-full rounded-lg" />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { SidebarContent } from '@/components/layout/SidebarContent';
import { Topbar } from '@/components/layout/Topbar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

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

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

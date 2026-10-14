import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';
import { NAV_ITEMS } from '@/components/layout/nav-items';
import { SheetClose } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface SidebarContentProps {
  /** Fecha a gaveta ao navegar (usado apenas na versão mobile). */
  onNavigate?: () => void;
}

/**
 * Conteúdo do menu lateral.
 *
 * Renderizado em dois lugares: dentro do `<aside>` fixo no desktop e dentro do
 * `<Sheet>` no celular. Por isso não define posicionamento nem largura —
 * quem o hospeda decide.
 */
export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user !== null && item.roles.includes(user.role)),
  );

  return (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-5">
        <Logo variant="lockup" size={32} className="text-white" />

        {/* Só na gaveta do celular (é quando `onNavigate` existe). Tocar fora
            já fecha o menu, mas isso não é óbvio — e quem usa leitor de tela
            não tem "fora" para tocar. */}
        {onNavigate && (
          <SheetClose
            className="-mr-2 flex size-10 items-center justify-center rounded-md text-brand-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
            aria-label="Fechar menu"
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        )}
      </div>

      <nav
        aria-label="Navegação principal"
        className="scrollbar-slim flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors touch:py-3',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900',
                isActive
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-100 hover:bg-white/10 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Barra âmbar marca o item atual: a cor de destaque da marca
                    carrega o significado, e não apenas o tom do fundo. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-amber-400 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-5 py-4">
        {/* Tons 100/200, não 200/300: o 300 sobre o fundo do menu ficava em
            4.12:1, abaixo do mínimo de 4.5:1 para texto pequeno. */}
        <p className="text-xs font-medium text-brand-100">Pro Accounting</p>
        <p className="text-xs text-brand-200">Gestão contábil · v1.0</p>
      </div>
    </div>
  );
}

import { Bell, ChevronDown, LogOut, Menu, Settings, User as UserIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { NAV_ITEMS } from '@/components/layout/nav-items';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApiHealth } from '@/hooks/use-api-health';
import { useAuth } from '@/hooks/use-auth';
import { ROLE_LABELS } from '@/types/auth';
import { getInitials } from '@/utils/format';

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const health = useApiHealth();

  // Título da página a partir do próprio menu — sem uma segunda lista de
  // títulos para manter em sincronia.
  const currentItem = NAV_ITEMS.find(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );

  const handleSignOut = (): void => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Abrir menu de navegação"
      >
        <Menu className="size-5" />
      </Button>

      <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
        {currentItem?.label ?? 'Pro Accounting'}
      </h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Estado da API: prova visível de que frontend, backend e banco estão
            conversando. Some em telas estreitas para não competir com o título. */}
        <ApiStatusBadge
          isLoading={health.isLoading}
          isOnline={health.data?.status === 'ok'}
          hasError={health.isError}
          database={health.data?.database}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notificações">
              <Bell className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação no momento.
              <p className="mt-1 text-xs">
                Os alertas de faturas e contratos aparecerão aqui.
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-auto gap-2 px-2 py-1.5">
              <Avatar>
                <AvatarFallback>{getInitials(user?.name ?? '')}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight">{user?.name}</span>
                <span className="block text-xs leading-tight text-muted-foreground">
                  {user ? ROLE_LABELS[user.role] : ''}
                </span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/configuracoes')}>
              <UserIcon />
              Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/configuracoes')}>
              <Settings />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={handleSignOut}>
              <LogOut />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

interface ApiStatusBadgeProps {
  isLoading: boolean;
  isOnline: boolean;
  hasError: boolean;
  database: 'connected' | 'disconnected' | undefined;
}

function ApiStatusBadge({ isLoading, isOnline, hasError, database }: ApiStatusBadgeProps) {
  if (isLoading) {
    return (
      <Badge variant="neutral" className="hidden md:inline-flex">
        Verificando API…
      </Badge>
    );
  }

  if (hasError) {
    return (
      <Badge variant="danger" className="hidden md:inline-flex" title="A API não respondeu.">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-red-600" />
        API offline
      </Badge>
    );
  }

  if (!isOnline) {
    return (
      <Badge
        variant="warning"
        className="hidden md:inline-flex"
        title={
          database === 'disconnected'
            ? 'A API respondeu, mas não conseguiu acessar o PostgreSQL.'
            : 'A API respondeu com estado degradado.'
        }
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-600" />
        Banco indisponível
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="hidden md:inline-flex" title="API e banco de dados no ar.">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" />
      Sistema online
    </Badge>
  );
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { AuthContext, type AuthContextValue, AuthProvider } from '@/contexts/auth-context';
import { AppRoutes } from '@/routes';
import type { AuthUser } from '@/types/auth';

export const ADMIN: AuthUser = {
  id: 'u-admin',
  name: 'Ana Administradora',
  email: 'ana@escritorio.com.br',
  role: 'ADMIN',
};

export const EMPLOYEE: AuthUser = {
  id: 'u-func',
  name: 'Fábio Funcionário',
  email: 'fabio@escritorio.com.br',
  role: 'EMPLOYEE',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/** Mostra a rota atual na tela, para as asserções de navegação. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/**
 * Renderiza a aplicação inteira — rotas, guards, layout e AuthProvider reais —
 * numa rota inicial. A sessão é restaurada como no navegador: token no
 * localStorage + `GET /auth/me` (que o teste precisa simular).
 */
export function renderApp(initialRoute: string, options: { token?: string } = {}) {
  if (options.token) {
    window.localStorage.setItem('pro-accounting:token', options.token);
  }

  const queryClient = createTestQueryClient();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthProvider>
          <AppRoutes />
          <LocationProbe />
          <Toaster />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...utils, user: userEvent.setup(), queryClient };
}

/**
 * Renderiza um componente isolado com um usuário logado FIXO (sem passar por
 * `/auth/me`) — para testar formulários e diálogos sem montar a app inteira.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { user?: AuthUser | null; route?: string; path?: string } = {},
) {
  const queryClient = createTestQueryClient();
  const authUser = options.user === undefined ? ADMIN : options.user;

  const auth: AuthContextValue = {
    user: authUser,
    isLoading: false,
    isAuthenticated: authUser !== null,
    signIn: async () => undefined,
    signOut: () => undefined,
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>
          <Routes>
            <Route path={options.path ?? '*'} element={children} />
          </Routes>
          <LocationProbe />
          <Toaster />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

  return { ...render(ui, { wrapper: Wrapper }), user: userEvent.setup(), queryClient };
}

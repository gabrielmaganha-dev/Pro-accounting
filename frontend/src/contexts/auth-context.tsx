import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { UNAUTHORIZED_EVENT } from '@/services/api';
import { fetchCurrentUser, login as loginRequest } from '@/services/auth.service';
import { tokenStorage } from '@/utils/storage';
import type { AuthUser, LoginCredentials } from '@/types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  /** Verdadeiro enquanto a sessão guardada está sendo revalidada na API. */
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Estado de autenticação da aplicação.
 *
 * Por que não usar TanStack Query para o usuário logado: a sessão é estado
 * global de aplicação, não cache de servidor. Ela decide QUAIS rotas existem,
 * e misturar isso com invalidação de cache tornaria o fluxo de redirecionamento
 * difícil de prever.
 *
 * Precisa estar dentro de <QueryClientProvider> — usa `useQueryClient` para
 * limpar o cache no logout.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const signOut = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    // Impede que os dados do usuário anterior apareçam por um instante se
    // outra pessoa entrar em seguida na mesma máquina.
    queryClient.clear();
  }, [queryClient]);

  /**
   * Restauração da sessão ao abrir/recarregar a página.
   *
   * O token no localStorage não é confiável por si só — pode estar expirado ou
   * ter sido revogado. Quem decide é a API, via /auth/me.
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      if (!tokenStorage.get()) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const currentUser = await fetchCurrentUser();
        if (!cancelled) setUser(currentUser);
      } catch {
        // Token inválido, expirado ou API fora do ar: segue deslogado.
        tokenStorage.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Encerra a sessão quando qualquer requisição receber 401. */
  useEffect(() => {
    const handleUnauthorized = (): void => signOut();

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [signOut]);

  const signIn = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    const result = await loginRequest(credentials);
    tokenStorage.set(result.token);
    setUser(result.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signOut,
    }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

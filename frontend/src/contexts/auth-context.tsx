import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { UNAUTHORIZED_EVENT } from '@/services/api';
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from '@/services/auth.service';
import { tokenStorage } from '@/utils/storage';
import type { AuthUser, LoginCredentials, LoginResponse } from '@/types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  /** Verdadeiro enquanto a sessão guardada está sendo revalidada na API. */
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signOut: () => void;
  /**
   * Substitui o token e o usuário da sessão atual.
   *
   * Usada pela troca de senha: a API invalida o token anterior no mesmo
   * instante em que grava a senha nova e devolve um token novo. Sem trocá-lo
   * aqui, a requisição seguinte levaria 401 e a pessoa seria deslogada logo
   * após acertar a senha.
   */
  renewSession: (session: LoginResponse) => void;
  /**
   * Atualiza os dados do usuário da sessão sem trocar o token.
   *
   * Usada pela edição do próprio perfil: o nome aparece na barra do topo e no
   * avatar, e sem isto continuaria o antigo até a pessoa sair e entrar de novo
   * — o que faria a tela parecer não ter salvado.
   */
  updateCurrentUser: (user: AuthUser) => void;
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
    /**
     * Avisa o servidor ANTES de apagar o token, porque a rota exige
     * autenticação — invertida a ordem, a requisição sairia sem credencial e o
     * logout nunca entraria na trilha de auditoria.
     *
     * Sem `await`: a saída não deve esperar a rede. Se a chamada falhar, a
     * sessão termina de qualquer forma.
     */
    void logoutRequest();

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

  /**
   * Encerra a sessão quando qualquer requisição receber 401.
   *
   * Aqui NÃO chama a rota de logout: o token já foi recusado, então a chamada
   * receberia outro 401 e dispararia o mesmo evento em laço. Limpa direto.
   */
  useEffect(() => {
    const handleUnauthorized = (): void => {
      tokenStorage.clear();
      setUser(null);
      queryClient.clear();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [queryClient]);

  const signIn = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    const result = await loginRequest(credentials);
    tokenStorage.set(result.token);
    setUser(result.user);
  }, []);

  const renewSession = useCallback((session: LoginResponse): void => {
    tokenStorage.set(session.token);
    setUser(session.user);
  }, []);

  const updateCurrentUser = useCallback((next: AuthUser): void => {
    setUser(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signOut,
      renewSession,
      updateCurrentUser,
    }),
    [user, isLoading, signIn, signOut, renewSession, updateCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

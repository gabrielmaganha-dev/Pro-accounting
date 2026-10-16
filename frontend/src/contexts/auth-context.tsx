import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, UNAUTHORIZED_EVENT } from '@/services/api';
import {
  clearGoogleSession,
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
  /**
   * A sessão guardada não pôde ser conferida por um motivo que NÃO é ela ser
   * inválida: API fora do ar, banco indisponível, limite de requisições. O
   * token é mantido; as rotas protegidas oferecem "Tentar novamente" em vez de
   * mandar para o login.
   */
  sessionError: string | null;
  retrySession: () => void;
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
  const [sessionError, setSessionError] = useState<string | null>(null);
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
    setSessionError(null);
    // Impede que os dados do usuário anterior apareçam por um instante se
    // outra pessoa entrar em seguida na mesma máquina.
    queryClient.clear();
    // Resto de sessão do Supabase (login com Google), se houver.
    void clearGoogleSession();
  }, [queryClient]);

  /**
   * Restauração da sessão ao abrir/recarregar a página.
   *
   * O token no localStorage não é confiável por si só — pode estar expirado ou
   * ter sido revogado. Quem decide é a API, via /auth/me.
   */
  const restoreSession = useCallback(
    async (isCancelled: () => boolean = () => false): Promise<void> => {
      if (!tokenStorage.get()) {
        if (!isCancelled()) setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setSessionError(null);

      try {
        const currentUser = await fetchCurrentUser();
        if (!isCancelled()) setUser(currentUser);
      } catch (error) {
        if (isCancelled()) return;

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // A API recusou a sessão: token vencido, revogado, conta bloqueada.
          tokenStorage.clear();
          setUser(null);
        } else {
          // API fora do ar, banco indisponível, muitas requisições: a sessão
          // pode muito bem ser válida. Deslogar aqui obrigaria a pessoa a
          // entrar de novo só porque o servidor piscou durante um F5.
          setSessionError(
            error instanceof ApiError && error.code !== 'NETWORK_ERROR'
              ? error.message
              : 'Não foi possível conectar ao servidor para verificar sua sessão.',
          );
        }
      } finally {
        if (!isCancelled()) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void restoreSession(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [restoreSession]);

  const retrySession = useCallback(() => {
    void restoreSession();
  }, [restoreSession]);

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
      setSessionError(null);
      queryClient.clear();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [queryClient]);

  const signIn = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    const result = await loginRequest(credentials);
    tokenStorage.set(result.token);
    setSessionError(null);
    setUser(result.user);
  }, []);

  const renewSession = useCallback((session: LoginResponse): void => {
    tokenStorage.set(session.token);
    setSessionError(null);
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
      sessionError,
      retrySession,
      signIn,
      signOut,
      renewSession,
      updateCurrentUser,
    }),
    [
      user,
      isLoading,
      sessionError,
      retrySession,
      signIn,
      signOut,
      renewSession,
      updateCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

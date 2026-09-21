import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';

/**
 * Acesso ao estado de autenticação.
 *
 * Lança se usado fora do provider: é melhor um erro explícito durante o
 * desenvolvimento do que um `user` eternamente nulo, que apareceria como
 * "redireciona para o login sem motivo" e levaria horas para ser rastreado.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  }

  return context;
}

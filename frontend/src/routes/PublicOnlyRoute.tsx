import { Navigate, Outlet } from 'react-router-dom';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { useAuth } from '@/hooks/use-auth';

/**
 * Inverso do ProtectedRoute: impede que quem já está autenticado veja a tela
 * de login. Sem isto, voltar para /login com sessão ativa mostraria um
 * formulário inútil.
 */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

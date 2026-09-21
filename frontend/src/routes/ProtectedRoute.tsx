import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { useAuth } from '@/hooks/use-auth';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  /** Perfis autorizados. Ausente = qualquer usuário autenticado. */
  roles?: UserRole[];
}

/**
 * Guard de rota.
 *
 * IMPORTANTE: isto é controle de NAVEGAÇÃO, não de segurança. Qualquer pessoa
 * consegue alterar o JavaScript no próprio navegador e chegar à tela. O que
 * realmente protege os dados é o `authMiddleware` + `roleMiddleware` na API,
 * que decidem o que cada perfil pode ler e gravar.
 */
export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Enquanto a sessão guardada está sendo revalidada não dá para decidir:
  // redirecionar agora expulsaria um usuário legitimamente logado.
  if (isLoading) {
    return <FullPageLoader message="Verificando sua sessão…" />;
  }

  if (!user) {
    // Guarda a rota pretendida para retomá-la depois do login.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

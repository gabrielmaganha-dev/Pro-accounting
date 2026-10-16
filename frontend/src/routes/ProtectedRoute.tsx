import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ErrorState } from '@/components/common/ErrorState';
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
  const { user, isLoading, sessionError, retrySession } = useAuth();
  const location = useLocation();

  // Enquanto a sessão guardada está sendo revalidada não dá para decidir:
  // redirecionar agora expulsaria um usuário legitimamente logado.
  if (isLoading) {
    return <FullPageLoader message="Verificando sua sessão…" />;
  }

  // A sessão guardada não pôde ser CONFERIDA (servidor fora do ar), o que é
  // diferente de ser inválida: em vez de mandar para o login — e perder o
  // token —, oferece tentar de novo.
  if (!user && sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <ErrorState
            title="Não foi possível verificar sua sessão"
            description={sessionError}
            onRetry={retrySession}
          />
        </div>
      </div>
    );
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

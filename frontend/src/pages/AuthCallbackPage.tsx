import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { FullPageLoader } from '@/components/common/FullPageLoader';
import { useAuth } from '@/hooks/use-auth';
import { type LoginNotice, noticeForGoogleError, noticeForOAuthError } from '@/lib/auth-notice';
import { completeGoogleSignIn } from '@/services/auth.service';

/**
 * /auth/callback — para onde o Google (via Supabase) devolve a pessoa.
 *
 * O endereço chega com `?code=` (sucesso) ou `?error=` (cancelado/falhou).
 * Nada daqui é aceito pela palavra da URL: o código só vale se o Supabase o
 * trocar por uma sessão — e só com o segredo PKCE guardado neste navegador
 * antes da ida ao Google —, e a sessão do sistema só sai se a API confirmar a
 * identidade no próprio Supabase.
 *
 * Desfechos:
 *  • sucesso → painel;
 *  • qualquer outro → tela de login, com o aviso explicando o que houve
 *    (cancelado, aguardando aprovação, bloqueado, falha de rede...).
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { renewSession } = useAuth();

  // O código é de uso único. Em desenvolvimento o React executa efeitos duas
  // vezes; a segunda troca falharia e mostraria um erro falso.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const backToLogin = (notice: LoginNotice): void => {
      navigate('/login', { replace: true, state: { notice } });
    };

    const oauthError = searchParams.get('error');
    const code = searchParams.get('code');

    if (oauthError) {
      backToLogin(noticeForOAuthError(oauthError));
      return;
    }

    if (!code) {
      backToLogin({
        tone: 'error',
        message: 'Endereço de retorno do Google inválido ou expirado. Tente entrar de novo.',
      });
      return;
    }

    completeGoogleSignIn(code)
      .then((session) => {
        renewSession(session);
        toast.success('Acesso liberado. Bem-vindo!');
        navigate('/dashboard', { replace: true });
      })
      .catch((error: unknown) => backToLogin(noticeForGoogleError(error)));
  }, [navigate, renewSession, searchParams]);

  return <FullPageLoader message="Concluindo o login com o Google…" />;
}

import { Info, Loader2, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Logo } from '@/components/brand/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useGoogleLoginAvailable } from '@/hooks/use-google-login';

/**
 * /criar-conta — cadastro pelo Google.
 *
 * Não existe cadastro público com e-mail e senha, e isso é deliberado: sem
 * confirmar por e-mail que a pessoa é dona do endereço, qualquer um poderia
 * cadastrar o e-mail de outra pessoa — e, quando a dona verdadeira entrasse
 * depois com o Google, cairia numa conta preparada por terceiros. No cadastro
 * pelo Google, quem confirma o e-mail é o próprio Google.
 *
 * A conta nasce aguardando aprovação: ninguém entra no sistema de um
 * escritório só por ter um Gmail.
 */
export function SignUpPage() {
  const googleAvailable = useGoogleLoginAvailable();

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex justify-center lg:hidden">
        <Logo variant="full" size={44} />
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Criar conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cadastre-se com a sua Conta Google. Depois do cadastro, um administrador do escritório
          libera o seu acesso.
        </p>
      </div>

      {googleAvailable === null && (
        <div className="flex justify-center py-6" role="status" aria-label="Carregando">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {googleAvailable === true && <GoogleSignInButton />}

      {googleAvailable === false && (
        <Alert>
          <Info />
          <AlertDescription>
            O cadastro pelo Google não está disponível no momento. Peça o seu acesso a um
            administrador do sistema.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <UserPlus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Acesso com e-mail e senha é criado pelo administrador do sistema, em{' '}
          <span className="font-medium text-foreground">Usuários</span>.
        </p>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Já tem uma conta?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Ao continuar, você concorda com o tratamento dos seus dados descrito na{' '}
        <Link to="/privacidade" className="underline hover:text-foreground">
          Política de privacidade
        </Link>
        .
      </p>
    </div>
  );
}

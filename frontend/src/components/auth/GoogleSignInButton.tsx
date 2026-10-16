import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { startGoogleSignIn } from '@/services/auth.service';

/**
 * Logotipo "G" do Google nas cores oficiais — o que as diretrizes de marca do
 * Google pedem para botões de login, ao lado de um texto que diga claramente
 * que a autenticação é feita pelo Google.
 */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-[18px] shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  disabled?: boolean;
}

/**
 * "Continuar com Google".
 *
 * Depois do clique a página sai para o Google; o estado "Redirecionando…"
 * cobre os instantes até isso acontecer e impede o segundo clique, que
 * iniciaria um segundo fluxo e invalidaria o primeiro.
 */
export function GoogleSignInButton({ disabled = false }: GoogleSignInButtonProps) {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (redirecting) return;

    setRedirecting(true);
    setError(null);

    try {
      await startGoogleSignIn();
    } catch {
      setRedirecting(false);
      setError(
        'Não foi possível abrir o login do Google. Verifique sua conexão e tente novamente.',
      );
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => void handleClick()}
        disabled={disabled || redirecting}
        aria-busy={redirecting}
      >
        {redirecting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Redirecionando para o Google…
          </>
        ) : (
          <>
            <GoogleLogo />
            Continuar com Google
          </>
        )}
      </Button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

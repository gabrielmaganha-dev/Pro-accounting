import { ApiError } from '@/services/api';
import { GoogleSignInError } from '@/services/auth.service';

/**
 * Aviso exibido na tela de login depois de uma tentativa que não terminou em
 * sessão — viaja no `state` da navegação, nunca na URL (um texto na URL
 * poderia ser forjado num link e exibido como se viesse do sistema).
 */
export interface LoginNotice {
  tone: 'info' | 'error';
  message: string;
}

export function isLoginNotice(value: unknown): value is LoginNotice {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LoginNotice>;
  return (
    (candidate.tone === 'info' || candidate.tone === 'error') &&
    typeof candidate.message === 'string'
  );
}

/**
 * O que dizer a quem voltou do Google sem conseguir entrar.
 *
 * As mensagens da API (aguardando aprovação, bloqueada, e-mail já vinculado)
 * já são escritas para o usuário final e passam como estão. O resto vira uma
 * frase genérica: detalhe técnico não ajuda quem está na tela de login.
 */
export function noticeForGoogleError(error: unknown): LoginNotice {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ACCOUNT_PENDING':
        return { tone: 'info', message: error.message };
      case 'ACCOUNT_BLOCKED':
      case 'CONFLICT':
      case 'FORBIDDEN':
      case 'SERVICE_UNAVAILABLE':
      case 'TOO_MANY_REQUESTS':
        return { tone: 'error', message: error.message };
      case 'NETWORK_ERROR':
        return {
          tone: 'error',
          message: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
        };
      default:
        return {
          tone: 'error',
          message: 'Não foi possível concluir o login com o Google. Tente novamente.',
        };
    }
  }

  if (error instanceof GoogleSignInError && error.reason === 'not-configured') {
    return { tone: 'error', message: 'O login com Google não está disponível no momento.' };
  }

  // Código de retorno vencido, já usado ou aberto em outro navegador.
  return {
    tone: 'error',
    message: 'O login com o Google expirou ou não pôde ser confirmado. Tente entrar de novo.',
  };
}

/**
 * Erro devolvido pelo Supabase/Google no próprio endereço de retorno
 * (`?error=...`). `access_denied` é a pessoa que clicou em "Cancelar".
 */
export function noticeForOAuthError(errorCode: string): LoginNotice {
  if (errorCode === 'access_denied') {
    return {
      tone: 'info',
      message: 'Login com Google cancelado. Você pode tentar de novo quando quiser.',
    };
  }

  return {
    tone: 'error',
    message: 'O Google não concluiu o login. Tente novamente em instantes.',
  };
}

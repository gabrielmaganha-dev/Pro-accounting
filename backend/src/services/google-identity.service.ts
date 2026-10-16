import { z } from 'zod';

import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

/**
 * Confirmação, no servidor, de quem voltou do login com o Google.
 *
 * A interface conclui o fluxo OAuth com o Supabase Auth e recebe dele um token
 * de acesso. Esse token chega aqui no corpo de uma requisição — ou seja, vem
 * do navegador, e nada nele pode ser aceito pela palavra de quem enviou. Em
 * vez de decodificar o token por conta própria, a API pergunta ao próprio
 * Supabase (`GET /auth/v1/user`) a quem ele pertence: o servidor de
 * autenticação confere assinatura, validade e se a sessão não foi revogada, e
 * devolve o usuário como ELE o conhece. Um token de outro projeto Supabase,
 * adulterado ou vencido é recusado lá.
 *
 * Só então valem os dados de identidade — e só os que o Google atestou: o
 * e-mail é aceito apenas se o provedor for o Google e o e-mail estiver
 * verificado. É isso que permite usar o e-mail para encontrar uma conta já
 * cadastrada sem abrir a porta para alguém que apenas DIGA ser aquele e-mail.
 */

export interface GoogleIdentity {
  /** Id do usuário no Supabase Auth — o vínculo permanente com a conta. */
  authUserId: string;
  /** E-mail verificado pelo Google, em minúsculas. */
  email: string;
  name: string;
  avatarUrl: string | null;
}

const REQUEST_TIMEOUT_MS = 8_000;

/** Foto só do próprio Google: o endereço vai parar numa tag <img>. */
const GOOGLE_AVATAR = /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i;

const supabaseUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullish(),
  email_confirmed_at: z.string().nullish(),
  app_metadata: z
    .object({
      provider: z.string().nullish(),
      providers: z.array(z.string()).nullish(),
    })
    .passthrough()
    .nullish(),
  user_metadata: z.record(z.unknown()).nullish(),
  identities: z
    .array(
      z
        .object({
          provider: z.string(),
          identity_data: z.record(z.unknown()).nullish(),
        })
        .passthrough(),
    )
    .nullish(),
});

type SupabaseUser = z.infer<typeof supabaseUserSchema>;

const NOT_CONFIRMED =
  'Não foi possível confirmar o seu login com o Google. Tente entrar de novo.';

export function isGoogleLoginConfigured(): boolean {
  return env.supabase !== null;
}

export async function verifyGoogleSession(accessToken: string): Promise<GoogleIdentity> {
  const supabase = env.supabase;

  if (!supabase) {
    throw AppError.notImplemented('O login com Google não está configurado neste servidor.');
  }

  let response: Response;

  try {
    response = await fetch(`${supabase.url}/auth/v1/user`, {
      headers: {
        apikey: supabase.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw AppError.serviceUnavailable(
      'Não foi possível confirmar o login com o Google agora. Tente novamente em instantes.',
    );
  }

  // 401/403: token inválido, vencido, revogado ou de outro projeto.
  if (response.status === 401 || response.status === 403) {
    throw AppError.unauthorized(NOT_CONFIRMED);
  }

  if (!response.ok) {
    throw AppError.serviceUnavailable(
      'Não foi possível confirmar o login com o Google agora. Tente novamente em instantes.',
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw AppError.serviceUnavailable(
      'Não foi possível confirmar o login com o Google agora. Tente novamente em instantes.',
    );
  }

  const parsed = supabaseUserSchema.safeParse(body);

  if (!parsed.success) {
    throw AppError.unauthorized(NOT_CONFIRMED);
  }

  return toGoogleIdentity(parsed.data);
}

function toGoogleIdentity(user: SupabaseUser): GoogleIdentity {
  const googleIdentity = user.identities?.find((identity) => identity.provider === 'google');
  const viaGoogle =
    googleIdentity !== undefined ||
    user.app_metadata?.provider === 'google' ||
    (user.app_metadata?.providers ?? []).includes('google');

  if (!viaGoogle) {
    throw AppError.forbidden('Use o botão "Continuar com Google" para entrar com uma Conta Google.');
  }

  const email = user.email?.trim().toLowerCase();
  const googleSaysVerified =
    googleIdentity?.identity_data?.email_verified === true ||
    user.user_metadata?.email_verified === true;

  // As duas confirmações: o Supabase registrou o e-mail como confirmado E o
  // Google declarou o e-mail verificado. Sem elas, o e-mail não identifica
  // ninguém e não pode ser usado para encontrar uma conta existente.
  if (!email || !user.email_confirmed_at || !googleSaysVerified) {
    throw AppError.forbidden(
      'O Google não confirmou o e-mail desta conta. Use uma Conta Google com e-mail verificado.',
    );
  }

  return {
    authUserId: user.id,
    email,
    name: pickName(user, email),
    avatarUrl: pickAvatar(user),
  };
}

function pickName(user: SupabaseUser, email: string): string {
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata.full_name, metadata.name];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length >= 2) {
      return candidate.trim().slice(0, 120);
    }
  }

  // Sem nome no perfil Google: a parte antes do @ é melhor que nada, e o
  // administrador pode corrigir ao aprovar o acesso.
  return email.split('@')[0]?.slice(0, 120) || email.slice(0, 120);
}

function pickAvatar(user: SupabaseUser): string | null {
  const metadata = user.user_metadata ?? {};

  for (const candidate of [metadata.avatar_url, metadata.picture]) {
    if (typeof candidate === 'string' && candidate.length <= 500 && GOOGLE_AVATAR.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

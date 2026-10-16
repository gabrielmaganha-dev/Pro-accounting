import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

/**
 * Cliente do Supabase — usado SÓ para o login com Google.
 *
 * O Supabase Auth faz o papel de ponte com o Google (OAuth 2.0 + OpenID
 * Connect, com PKCE): leva a pessoa à tela do Google, recebe a resposta e
 * devolve à interface um token que prova quem ela é. Esse token é entregue à
 * API, que o confere no próprio Supabase e abre a sessão do sistema — a mesma
 * do login por senha. A sessão do Supabase é descartada logo em seguida: o
 * sistema tem UMA sessão só, não duas.
 *
 * Configuração:
 *  • `flowType: 'pkce'` — o retorno do Google traz um código de uso único,
 *    trocado por token aqui com um segredo que nunca saiu do navegador. É o
 *    fluxo recomendado para aplicações no navegador (o "implicit", com token
 *    na URL, é o obsoleto).
 *  • `detectSessionInUrl: false` — a página /auth/callback faz a troca do
 *    código explicitamente, para tratar cada erro com uma mensagem própria.
 *  • `persistSession: true` — necessário para o segredo do PKCE sobreviver à
 *    ida e volta ao Google (a página recarrega no meio do caminho).
 *  • `autoRefreshToken: false` — a sessão do Supabase vive segundos; não há o
 *    que renovar.
 *
 * A biblioteca é carregada SOB DEMANDA (import dinâmico): quem nunca clica em
 * "Continuar com Google" não baixa nada dela.
 */
export const SUPABASE_STORAGE_KEY = 'pro-accounting:supabase-auth';

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  const config = env.supabase;
  if (!config) return Promise.resolve(null);

  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url, config.anonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: false,
        storageKey: SUPABASE_STORAGE_KEY,
      },
    }),
  );

  return client;
}

/** Existe algo do Supabase guardado neste navegador (sessão ou segredo PKCE)? */
export function hasStoredSupabaseState(): boolean {
  try {
    return Object.keys(window.localStorage).some((key) => key.startsWith(SUPABASE_STORAGE_KEY));
  } catch {
    return false;
  }
}

let googleAvailability: Promise<boolean> | null = null;

/**
 * O provedor Google está ligado no projeto Supabase?
 *
 * Pergunta ao próprio Supabase (`/auth/v1/settings`, rota pública). Assim o
 * botão só aparece quando o login com Google realmente funciona — sem uma
 * variável a mais para lembrar de mudar quando a configuração no painel do
 * Supabase ficar pronta. Qualquer falha na consulta esconde o botão: melhor
 * nenhum botão do que um que leva a uma página de erro.
 */
export function isGoogleLoginAvailable(): Promise<boolean> {
  const supabase = env.supabase;
  if (!supabase) return Promise.resolve(false);

  googleAvailability ??= fetch(`${supabase.url}/auth/v1/settings`, {
    headers: { apikey: supabase.anonKey },
  })
    .then(async (response) => {
      if (!response.ok) return false;
      const settings = (await response.json()) as { external?: { google?: boolean } };
      return settings.external?.google === true;
    })
    .catch(() => {
      // Falha de rede não é resposta definitiva: a próxima tela pergunta de novo.
      googleAvailability = null;
      return false;
    });

  return googleAvailability;
}

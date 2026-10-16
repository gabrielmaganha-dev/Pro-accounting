import { useEffect, useState } from 'react';

import { isGoogleLoginAvailable } from '@/lib/supabase';

/**
 * O login com Google está disponível? `null` enquanto pergunta ao Supabase.
 *
 * As telas de login e de cadastro só mostram o botão com `true`: sem
 * configuração — ou com o provedor desligado no painel do Supabase — não há
 * botão que leve a uma página de erro.
 */
export function useGoogleLoginAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void isGoogleLoginAvailable().then((value) => {
      if (!cancelled) setAvailable(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}

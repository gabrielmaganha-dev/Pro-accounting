import { useEffect } from 'react';

import { useSettings } from '@/hooks/use-settings';
import { applyTheme } from '@/lib/theme';

/**
 * Aplica a identidade visual salva assim que a configuração chega.
 *
 * Fica DENTRO do layout autenticado de propósito: a rota `/settings` exige
 * token, então montar isto na raiz faria a tela de login disparar uma
 * requisição que sempre receberia 401 e derrubaria a sessão pelo tratamento
 * global de 401 no cliente HTTP.
 *
 * Não renderiza nada — só existe pelo efeito colateral. Um componente é a forma
 * mais simples de pendurar um hook na árvore sem enfiar a lógica no layout.
 */
export function ThemeLoader() {
  const { data } = useSettings();

  useEffect(() => {
    if (!data) return;

    applyTheme({
      primaryColor: data.settings.primaryColor,
      secondaryColor: data.settings.secondaryColor,
    });
  }, [data]);

  return null;
}

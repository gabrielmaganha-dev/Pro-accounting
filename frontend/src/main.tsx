import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import '@/index.css';

/**
 * Aba aberta durante uma atualização do sistema.
 *
 * Algumas telas são carregadas sob demanda, em arquivos cujo nome leva o hash
 * do conteúdo. Depois de um deploy, os arquivos antigos deixam de existir no
 * servidor — e uma aba que ficou aberta, ao navegar para uma dessas telas,
 * pede um arquivo que não está mais lá. O Vite avisa com este evento.
 *
 * Recarregar a página traz o index.html novo e resolve. A marca de horário no
 * sessionStorage impede um laço: se a falha se repetir logo depois de
 * recarregar (servidor fora do ar, por exemplo), não recarrega de novo, e o
 * erro aparece em vez de a tela piscar para sempre. Passado um minuto a marca
 * deixa de valer — a aba que sobreviver a um segundo deploy também se recupera.
 */
window.addEventListener('vite:preloadError', (event) => {
  const RELOAD_FLAG = 'pro-accounting:reloaded-after-update';
  const RETRY_AFTER_MS = 60_000;

  try {
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Date.now() - lastReload < RETRY_AFTER_MS) return;

    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // Sem sessionStorage não há como evitar o laço: melhor não recarregar.
    return;
  }

  event.preventDefault();
  window.location.reload();
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  // Só acontece se alguém remover a <div id="root"> de index.html. Falhar com
  // mensagem clara é melhor do que uma tela branca sem explicação.
  throw new Error('Elemento #root não encontrado. Verifique o index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

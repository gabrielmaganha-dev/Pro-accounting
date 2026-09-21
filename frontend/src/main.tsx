import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import '@/index.css';

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

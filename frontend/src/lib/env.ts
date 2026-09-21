const DEFAULT_API_URL = 'http://localhost:3333/api';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl) {
  // Aviso em vez de exceção: derrubar a aplicação com tela branca por causa de
  // um .env faltando seria pior do que seguir com o padrão de desenvolvimento
  // e dizer claramente no console o que aconteceu.
  console.warn(
    `[Pro Accounting] VITE_API_URL não definida — usando ${DEFAULT_API_URL}. ` +
      'Copie frontend/.env.example para frontend/.env para configurar.',
  );
}

export const env = {
  /** Base da API, sem barra no final (as rotas já começam com "/"). */
  apiUrl: (configuredApiUrl || DEFAULT_API_URL).replace(/\/+$/, ''),
  isDevelopment: import.meta.env.DEV,
} as const;

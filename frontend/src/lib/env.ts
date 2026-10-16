/**
 * Padrão quando `VITE_API_URL` não foi definida.
 *
 *  • Desenvolvimento: a API roda em outra porta, na própria máquina.
 *  • Build de produção: `/api`, caminho relativo. Em produção a interface e a
 *    API saem pelo mesmo endereço (o nginx entrega os arquivos e repassa
 *    `/api` ao backend), então o caminho relativo serve em qualquer domínio.
 *
 * O padrão de produção existe porque `VITE_API_URL` é embutida no JavaScript
 * no momento do build. Um build feito sem a variável carregava
 * `http://localhost:3333` para dentro do pacote — e, publicado, mandava o
 * navegador de cada usuário procurar a API na máquina dele mesmo.
 */
const DEFAULT_API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3333/api';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl && import.meta.env.DEV) {
  // Aviso em vez de exceção: derrubar a aplicação com tela branca por causa de
  // um .env faltando seria pior do que seguir com o padrão de desenvolvimento
  // e dizer claramente no console o que aconteceu.
  console.warn(
    `[Pro Accounting] VITE_API_URL não definida — usando ${DEFAULT_API_URL}. ` +
      'Copie frontend/.env.example para frontend/.env para configurar.',
  );
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const env = {
  /** Base da API, sem barra no final (as rotas já começam com "/"). */
  apiUrl: (configuredApiUrl || DEFAULT_API_URL).replace(/\/+$/, ''),
  isDevelopment: import.meta.env.DEV,
  /**
   * Login com Google, via Supabase Auth. Nulo quando não configurado — o
   * botão "Continuar com Google" simplesmente não aparece, e o login por
   * e-mail e senha segue igual.
   *
   * As duas são públicas por natureza (vão no JavaScript do navegador): o
   * endereço do projeto e a chave anon/publishable. Segredo do Supabase
   * (service role, JWT secret) nunca entra aqui.
   */
  supabase:
    supabaseUrl && supabaseAnonKey ? { url: supabaseUrl, anonKey: supabaseAnonKey } : null,
} as const;

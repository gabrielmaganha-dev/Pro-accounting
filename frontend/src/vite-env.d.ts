/// <reference types="vite/client" />

/**
 * Tipagem das variáveis de ambiente do Vite.
 *
 * Sem isto, `import.meta.env.VITE_API_URL` seria `any` e um erro de digitação
 * no nome da variável só apareceria em runtime, como uma tela em branco.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

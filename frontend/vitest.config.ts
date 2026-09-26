import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

/**
 * Testes do frontend.
 *
 * Herda a configuração do Vite (alias `@/`, plugin React) para que o código
 * testado seja resolvido exatamente como no build. O navegador é simulado pelo
 * jsdom; a API é simulada no nível do `fetch` (ver tests/utils/server.ts), de
 * modo que serviços, hooks do TanStack Query e contexto de autenticação rodam
 * de verdade.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
      css: false,
      env: {
        VITE_API_URL: 'http://api.teste/api',
        TZ: 'America/Sao_Paulo',
      },
    },
  }),
);

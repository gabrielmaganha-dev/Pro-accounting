import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Precisa espelhar "paths" em tsconfig.json — o TypeScript resolve o
      // alias para checagem de tipos, o Vite resolve para o bundle. Se os dois
      // divergirem, o editor fica verde e o build quebra.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    // Falha em vez de pular para 5174 silenciosamente: a porta está na lista
    // de origens permitidas do CORS no backend, e mudá-la quebraria o login
    // com um erro difícil de associar à causa.
    strictPort: true,
  },

  preview: {
    port: 4173,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

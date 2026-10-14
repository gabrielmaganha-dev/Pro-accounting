import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Pacotes do React: não dependem de nada fora deste grupo. */
const REACT_CORE = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;

/** A biblioteca de gráficos e o que só ela usa. */
const CHARTS =
  /[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light|@reduxjs|react-redux|redux|redux-thunk|reselect|immer|es-toolkit|eventemitter3|tiny-invariant)[\\/]/;

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

    /**
     * Source maps DESLIGADOS no build publicado.
     *
     * O `.map` é o código-fonte original — nomes de variável, comentários,
     * estrutura de pastas — servido a qualquer visitante que abra as
     * ferramentas do navegador. Para depurar um problema de produção, gere um
     * build com `BUILD_SOURCEMAP=true` e NÃO publique os `.map`.
     */
    sourcemap: process.env.BUILD_SOURCEMAP === 'true',

    rollupOptions: {
      output: {
        /**
         * Bibliotecas em arquivos separados do código do sistema.
         *
         * O nome de cada arquivo leva o hash do conteúdo, e o nginx os serve
         * com cache de um ano. Com tudo num arquivo só, corrigir uma vírgula
         * numa tela mudava o hash do pacote inteiro e todo usuário baixava de
         * novo mais de 1 MB. Separadas, as bibliotecas — que só mudam quando
         * uma dependência é atualizada — continuam no cache do navegador.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Sem ciclo: o React não importa nada do arquivo das demais
          // bibliotecas, só o contrário.
          if (REACT_CORE.test(id)) return 'vendor-react';

          // Os gráficos ficam DE FORA de propósito. Só são usados por telas
          // carregadas sob demanda (painel e financeiro); sem regra manual, o
          // Rollup os agrupa sozinho num arquivo assíncrono, que a tela de
          // login não baixa. Em `vendor`, voltariam ao carregamento inicial.
          if (CHARTS.test(id)) return undefined;

          return 'vendor';
        },
      },
    },
  },
});

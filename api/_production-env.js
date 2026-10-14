/**
 * Precisa ser importado ANTES de backend/dist/app.js (ver api/index.js).
 *
 * Sem NODE_ENV, src/config/env.ts assume "development" e o logger tenta usar
 * o pino-pretty, que é dependência de desenvolvimento e não vai no pacote da
 * função — a API cairia na primeira requisição.
 *
 * O prefixo "_" impede a Vercel de publicar este arquivo como rota.
 */
process.env.NODE_ENV ??= 'production';

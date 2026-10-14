import './_production-env.js';

import { buildApp } from '../backend/dist/app.js';

/**
 * Função serverless da Vercel que atende toda a API.
 *
 * vercel.json reescreve /api/* para esta função, e `req.url` chega com o
 * caminho original (/api/clients, /api/auth/login...), então as rotas do
 * Fastify funcionam sem nenhuma adaptação.
 *
 * A aplicação é montada uma única vez por instância e reaproveitada nas
 * invocações seguintes — montar a cada requisição refaria o registro de todos
 * os plugins e abriria um pool novo do Prisma a cada chamada.
 */
let appPromise;

function getApp() {
  appPromise ??= buildApp()
    .then(async (app) => {
      await app.ready();
      return app;
    })
    .catch((error) => {
      // Permite nova tentativa na próxima requisição em vez de a instância
      // ficar presa a uma montagem que falhou.
      appPromise = undefined;
      throw error;
    });

  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit('request', req, res);
}

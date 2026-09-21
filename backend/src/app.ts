import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { registerErrorHandler } from './middlewares/error.middleware.js';
import { roleMiddleware } from './middlewares/role.middleware.js';
import { registerRoutes } from './routes/index.js';

/**
 * Monta a aplicação sem abrir a porta.
 *
 * Separar `buildApp()` de `server.ts` é o que torna a API testável: uma suíte
 * de testes chama `buildApp()` e usa `app.inject()` para simular requisições,
 * sem precisar de rede nem de porta livre.
 *
 * A ORDEM dos registros abaixo é significativa — está comentada em cada passo.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isDevelopment
      ? {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              colorize: true,
            },
          },
        }
      : { level: 'info' },

    // Necessário atrás de proxy/nginx para que o rate limit enxergue o IP real
    // do cliente, e não o do proxy (que bloquearia todo mundo de uma vez).
    trustProxy: true,

    // 1 MB. Sem teto, um POST gigante consome memória do processo.
    bodyLimit: 1_048_576,
  });

  // 1. Cabeçalhos de segurança primeiro, para que valham inclusive nas
  //    respostas de erro geradas pelos middlewares seguintes.
  await app.register(helmet, {
    // CSP protege documentos HTML; esta API só devolve JSON.
    contentSecurityPolicy: false,
    // O frontend roda em outra porta (5173) durante o desenvolvimento.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // 2. CORS. Lista branca explícita — nunca `origin: true`, que aceitaria
  //    qualquer site da internet a chamar a API com as credenciais do usuário.
  await app.register(cors, {
    origin: (origin, callback) => {
      // `origin` é indefinido em chamadas fora do navegador (curl, Postman,
      // health check), que não estão sujeitas à política de mesma origem.
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Nega SEM lançar erro.
      //
      // Passar um Error aqui faria o Fastify tratar a recusa como falha
      // inesperada e responder 500 — o que é enganoso (não houve erro de
      // servidor) e ainda enche o log de erro com tráfego rotineiro.
      // Respondendo sem o cabeçalho Access-Control-Allow-Origin, o próprio
      // navegador bloqueia a leitura da resposta, que é o comportamento
      // correto do CORS.
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86_400,
  });

  // 3. Limite global de requisições. Rotas sensíveis apertam esse valor
  //    individualmente via `config.rateLimit` (ver auth.routes.ts).
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // Mantém o mesmo envelope de erro do resto da API.
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: `Muitas tentativas. Tente novamente em ${Math.ceil(context.ttl / 1000)} segundo(s).`,
      },
    }),
  });

  // 4. JWT. A validade dos tokens é definida aqui uma única vez, e não em cada
  //    chamada de `sign`, para não haver dois lugares divergindo.
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // 5. Guards disponíveis em todas as rotas como app.authenticate / app.authorize.
  app.decorate('authenticate', authMiddleware);
  app.decorate('authorize', roleMiddleware);

  // 6. Handler central de erros ANTES das rotas, para capturar inclusive as
  //    falhas lançadas durante o registro dos handlers.
  registerErrorHandler(app);

  // 7. Rotas de negócio.
  await app.register(registerRoutes, { prefix: '/api' });

  return app;
}

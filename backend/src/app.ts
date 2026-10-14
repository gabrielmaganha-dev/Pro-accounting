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
  /**
   * Campos que NUNCA aparecem no log, em qualquer nível do objeto registrado.
   *
   * O Fastify não registra corpo de requisição por padrão, então hoje nenhuma
   * senha chega ao log por esse caminho. Esta lista existe para o dia em que
   * alguém ligar o log de corpo para depurar um problema — e, sem ela,
   * descobrir semanas depois que gravou a senha de todos os usuários em texto
   * puro no arquivo de log. Defesa contra o futuro, não contra o presente.
   *
   * `remove: true` apaga a chave em vez de trocá-la por "[Redacted]": um log
   * que mostra `password: "[Redacted]"` ainda revela que havia uma senha ali.
   */
  const redactPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.password',
    'req.body.currentPassword',
    'req.body.newPassword',
    'req.body.confirmPassword',
    'req.body.logo',
    'password',
    'currentPassword',
    'newPassword',
    'temporaryPassword',
    'token',
    'jwt',
  ];

  const app = Fastify({
    /**
     * Desenvolvimento: linha colorida e legível no terminal (pino-pretty).
     *
     * Produção: JSON puro, uma linha por evento, na saída padrão. Não há
     * arquivo de log nem rotação aqui de propósito — quem guarda, rotaciona e
     * envia o log é a plataforma (o driver de log do Docker, no compose de
     * produção). Um processo que escreve o próprio arquivo dentro do container
     * perde o log junto com o container.
     */
    logger: env.isDevelopment
      ? {
          level: env.LOG_LEVEL,
          redact: { paths: redactPaths, remove: true },
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              colorize: true,
            },
          },
        }
      : { level: env.LOG_LEVEL, redact: { paths: redactPaths, remove: true } },

    // Necessário atrás de proxy/nginx para que o rate limit enxergue o IP real
    // do cliente, e não o do proxy (que bloquearia todo mundo de uma vez).
    // Configurável porque, com a API exposta direto, confiar no cabeçalho
    // deixaria qualquer um forjar o próprio IP — ver TRUST_PROXY em env.ts.
    trustProxy: env.trustProxy,

    // 1 MB. Sem teto, um POST gigante consome memória do processo.
    bodyLimit: 1_048_576,
  });

  // 1. Cabeçalhos de segurança primeiro, para que valham inclusive nas
  //    respostas de erro geradas pelos middlewares seguintes.
  await app.register(helmet, {
    // CSP protege documentos HTML; esta API só devolve JSON. A política de
    // conteúdo da interface é definida por quem serve o HTML (nginx).
    contentSecurityPolicy: false,
    // O frontend roda em outra porta (5173) durante o desenvolvimento.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Nada do que a API devolve pode ficar em cache de navegador ou de proxy:
  // são dados financeiros de um usuário autenticado. Sem o cabeçalho, um proxy
  // intermediário — ou o botão "voltar" num computador compartilhado depois do
  // logout — poderia reapresentar uma resposta antiga.
  app.addHook('onSend', async (_request, reply) => {
    if (!reply.hasHeader('cache-control')) {
      void reply.header('cache-control', 'no-store');
    }
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
  /**
   * SEM `errorResponseBuilder`, e isso é uma correção.
   *
   * A versão anterior devolvia aqui o envelope pronto — um objeto simples
   * `{ success, error }`. O plugin o LANÇA como erro, e o handler central,
   * recebendo um objeto que não é `Error` e não tem `statusCode`, caía no ramo
   * final e respondia **500**. Resultado: a proteção contra força bruta
   * funcionava (a 11ª tentativa era bloqueada) mas se anunciava como falha do
   * servidor, o cliente não tinha como tratar "aguarde" e o log enchia de linha
   * de ERRO para tráfego que era só alguém insistindo.
   *
   * Sem o builder, o plugin lança o erro padrão dele, com `statusCode: 429`, e
   * o handler central já sabe traduzi-lo para o envelope da API — inclusive com
   * os segundos restantes, lidos do cabeçalho `retry-after`. O envelope passa a
   * ter UM dono, em vez de dois que discordavam.
   */
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
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

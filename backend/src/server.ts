import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/prisma.js';

/**
 * Ponto de entrada do processo: conecta ao banco, abre a porta e trata o
 * desligamento. Toda a montagem da aplicação vive em `app.ts`.
 */
async function bootstrap(): Promise<void> {
  const app = await buildApp();

  // Falha cedo: é melhor não subir do que aceitar requisições e devolver erro
  // 500 em todas elas porque o banco não estava no ar.
  try {
    await connectDatabase();
    app.log.info('PostgreSQL conectado.');
  } catch (error) {
    app.log.error(
      { err: error },
      'Não foi possível conectar ao PostgreSQL. Verifique se o container está no ar ' +
        '(docker compose up -d) e se DATABASE_URL em backend/.env está correta.',
    );
    process.exit(1);
  }

  /**
   * Desligamento ordenado: para de aceitar novas conexões, espera as em
   * andamento terminarem e só então fecha o pool do Prisma. Sem isto, um
   * Ctrl+C no meio de uma gravação pode deixar a transação pendurada.
   */
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info(`Sinal ${signal} recebido. Encerrando...`);

    try {
      await app.close();
      await disconnectDatabase();
      app.log.info('Encerrado com sucesso.');
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Falha ao encerrar.');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  // Uma promise rejeitada sem catch deixaria o processo num estado
  // indeterminado; preferimos registrar e morrer para o supervisor reiniciar.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Promise rejeitada sem tratamento.');
    void shutdown('unhandledRejection');
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API disponível em http://localhost:${env.PORT}/api`);
    app.log.info(`Health check:     http://localhost:${env.PORT}/api/health`);
  } catch (error) {
    app.log.error({ err: error }, `Não foi possível abrir a porta ${env.PORT}.`);
    process.exit(1);
  }
}

void bootstrap();
